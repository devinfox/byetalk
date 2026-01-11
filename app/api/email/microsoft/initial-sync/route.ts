import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  listEmails,
  extractEmailFromRecipient,
} from '@/lib/microsoft-graph'
import {
  refreshMicrosoftToken,
  isTokenExpired,
  calculateExpiresAt,
} from '@/lib/microsoft-auth'
import { GraphMessage } from '@/types/microsoft.types'
import { createClient } from '@/lib/supabase-server'

// Admin client for database operations
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Number of emails to import on initial sync
const INITIAL_SYNC_LIMIT = 100

/**
 * POST /api/email/microsoft/initial-sync
 * Performs initial email history import on first login
 * Only runs if initial_sync_completed is false
 */
export async function POST(request: NextRequest) {
  try {
    // Get current user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's CRM profile (check both auth_id and auth_user_id)
    let profile = null
    const { data: profileByAuthId } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (profileByAuthId) {
      profile = profileByAuthId
    } else {
      const { data: profileByAuthUserId } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()
      profile = profileByAuthUserId
    }

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Get Microsoft tokens that need initial sync
    const { data: tokens } = await supabaseAdmin
      .from('microsoft_oauth_tokens')
      .select('*')
      .eq('user_id', profile.id)
      .eq('sync_enabled', true)
      .eq('initial_sync_completed', false)

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        message: 'No tokens need initial sync',
        synced: 0,
      })
    }

    const results = []

    for (const token of tokens) {
      try {
        console.log(`[Initial Sync] Starting for ${token.email}`)

        // Check if token needs refresh
        let accessToken = token.access_token
        if (isTokenExpired(token.expires_at)) {
          const newTokens = await refreshMicrosoftToken(token.refresh_token)
          accessToken = newTokens.access_token

          // Update stored tokens
          await supabaseAdmin
            .from('microsoft_oauth_tokens')
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              expires_at: calculateExpiresAt(newTokens.expires_in).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', token.id)
        }

        // Get email account for this Microsoft token
        const { data: emailAccount } = await supabaseAdmin
          .from('email_accounts')
          .select('id')
          .eq('microsoft_token_id', token.id)
          .single()

        if (!emailAccount) {
          results.push({
            tokenId: token.id,
            email: token.email,
            error: 'No email account linked',
          })
          continue
        }

        // Create sync log entry
        const { data: syncLog } = await supabaseAdmin
          .from('microsoft_sync_log')
          .insert({
            token_id: token.id,
            sync_type: 'full',
            delta_token_before: null,
          })
          .select('id')
          .single()

        // Fetch emails from inbox
        const inboxEmails = await listEmails(accessToken, {
          folderId: 'inbox',
          top: INITIAL_SYNC_LIMIT,
          orderBy: 'receivedDateTime desc',
        })

        // Fetch emails from sent items
        const sentEmails = await listEmails(accessToken, {
          folderId: 'sentitems',
          top: Math.floor(INITIAL_SYNC_LIMIT / 2),
          orderBy: 'sentDateTime desc',
        })

        const allMessages = [
          ...inboxEmails.value.map(m => ({ ...m, folder: 'inbox' as const })),
          ...sentEmails.value.map(m => ({ ...m, folder: 'sent' as const })),
        ]

        console.log(`[Initial Sync] Fetched ${allMessages.length} emails for ${token.email}`)

        // Process messages
        let created = 0

        for (const msg of allMessages) {
          try {
            // Check if email already exists
            const { data: existing } = await supabaseAdmin
              .from('emails')
              .select('id')
              .eq('graph_message_id', msg.id)
              .single()

            if (existing) {
              continue // Skip existing emails
            }

            const isInbound = msg.folder === 'inbox'
            const emailData = convertGraphMessageToEmail(msg, emailAccount.id, isInbound)

            // Create or find thread
            const threadId = await getOrCreateThread(
              supabaseAdmin,
              emailAccount.id,
              msg,
              profile.id,
              msg.folder
            )

            // Insert email
            await supabaseAdmin.from('emails').insert({
              ...emailData,
              thread_id: threadId,
            })
            created++
          } catch (msgError) {
            console.error(`[Initial Sync] Error processing message:`, msgError)
          }
        }

        // Update sync log
        await supabaseAdmin
          .from('microsoft_sync_log')
          .update({
            status: 'completed',
            messages_synced: allMessages.length,
            messages_created: created,
            messages_updated: 0,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog?.id)

        // Mark initial sync as completed
        await supabaseAdmin
          .from('microsoft_oauth_tokens')
          .update({
            initial_sync_completed: true,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', token.id)

        console.log(`[Initial Sync] Completed for ${token.email}: ${created} emails imported`)

        results.push({
          tokenId: token.id,
          email: token.email,
          success: true,
          messagesProcessed: allMessages.length,
          created,
        })
      } catch (error) {
        console.error(`[Initial Sync] Error for token ${token.id}:`, error)

        // Mark sync as failed but completed (so we don't retry endlessly)
        await supabaseAdmin
          .from('microsoft_oauth_tokens')
          .update({
            initial_sync_completed: true, // Don't retry on failure
          })
          .eq('id', token.id)

        results.push({
          tokenId: token.id,
          email: token.email,
          error: (error as Error).message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error('[Initial Sync] Error:', error)
    return NextResponse.json({ error: 'Initial sync failed' }, { status: 500 })
  }
}

/**
 * Converts a Graph message to our email format
 */
function convertGraphMessageToEmail(
  msg: GraphMessage & { folder?: string },
  emailAccountId: string,
  isInbound: boolean
) {
  const from = msg.from ? extractEmailFromRecipient(msg.from) :
               msg.sender ? extractEmailFromRecipient(msg.sender) :
               { email: 'unknown@unknown.com', name: 'Unknown' }
  const to = msg.toRecipients?.map(extractEmailFromRecipient) || []
  const cc = msg.ccRecipients?.map(extractEmailFromRecipient) || []

  return {
    email_account_id: emailAccountId,
    message_id: msg.internetMessageId,
    from_address: from.email,
    from_name: from.name,
    to_addresses: to,
    cc_addresses: cc,
    bcc_addresses: [],
    subject: msg.subject,
    body_text: msg.body?.contentType === 'text' ? msg.body.content : null,
    body_html: msg.body?.contentType === 'html' ? msg.body.content : null,
    snippet: msg.bodyPreview,
    is_inbound: isInbound,
    status: isInbound ? 'delivered' : 'sent',
    sent_at: msg.sentDateTime,
    delivered_at: msg.receivedDateTime,
    is_read: msg.isRead,
    read_at: msg.isRead ? new Date().toISOString() : null,
    has_attachments: msg.hasAttachments,
    email_provider: 'microsoft',
    graph_message_id: msg.id,
    graph_conversation_id: msg.conversationId,
    graph_internet_message_id: msg.internetMessageId,
  }
}

/**
 * Gets or creates an email thread for the message
 */
async function getOrCreateThread(
  supabase: any,
  emailAccountId: string,
  msg: GraphMessage,
  userId: string,
  folder: 'inbox' | 'sent' = 'inbox'
) {
  // Try to find existing thread by Graph conversation ID
  const { data: existingByConversation } = await supabase
    .from('email_threads')
    .select('id, message_count, unread_count')
    .eq('email_account_id', emailAccountId)
    .contains('participants', [{ conversationId: msg.conversationId }])
    .single()

  if (existingByConversation) {
    // Update thread counts
    await supabase
      .from('email_threads')
      .update({
        message_count: (existingByConversation.message_count || 0) + 1,
        unread_count: msg.isRead
          ? existingByConversation.unread_count || 0
          : (existingByConversation.unread_count || 0) + 1,
        last_message_at: msg.receivedDateTime || msg.sentDateTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingByConversation.id)

    return existingByConversation.id
  }

  // Try to find by clean subject
  const cleanSubject = msg.subject?.replace(/^(Re:|Fwd:|RE:|FW:)\s*/gi, '').trim()
  if (cleanSubject) {
    const { data: subjectThread } = await supabase
      .from('email_threads')
      .select('id, message_count, unread_count')
      .eq('email_account_id', emailAccountId)
      .ilike('subject', cleanSubject)
      .single()

    if (subjectThread) {
      await supabase
        .from('email_threads')
        .update({
          message_count: (subjectThread.message_count || 0) + 1,
          unread_count: msg.isRead
            ? subjectThread.unread_count || 0
            : (subjectThread.unread_count || 0) + 1,
          participants: supabase.sql`participants || ${JSON.stringify([{ conversationId: msg.conversationId }])}::jsonb`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subjectThread.id)

      return subjectThread.id
    }
  }

  // Create new thread
  const participants = [
    ...(msg.from ? [extractEmailFromRecipient(msg.from)] : []),
    ...(msg.toRecipients?.map(extractEmailFromRecipient) || []),
    { conversationId: msg.conversationId },
  ]

  const { data: newThread } = await supabase
    .from('email_threads')
    .insert({
      email_account_id: emailAccountId,
      subject: msg.subject,
      participants,
      last_message_at: msg.receivedDateTime || msg.sentDateTime,
      message_count: 1,
      unread_count: msg.isRead ? 0 : 1,
      has_attachments: msg.hasAttachments,
      is_read: msg.isRead,
      folder,
    })
    .select('id')
    .single()

  return newThread?.id
}
