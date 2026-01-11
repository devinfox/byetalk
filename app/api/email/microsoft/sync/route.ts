import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  listEmailsDelta,
  extractEmailFromRecipient,
  mapGraphFolderToEmailFolder,
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

/**
 * POST /api/email/microsoft/sync
 * Syncs emails from Microsoft Graph API
 *
 * Body: { tokenId?: string, fullSync?: boolean }
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

    // Get user's CRM profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { tokenId, fullSync = false } = await request.json()

    // Get Microsoft token
    let tokenQuery = supabaseAdmin
      .from('microsoft_oauth_tokens')
      .select('*')
      .eq('user_id', profile.id)
      .eq('sync_enabled', true)

    if (tokenId) {
      tokenQuery = tokenQuery.eq('id', tokenId)
    }

    const { data: tokens } = await tokenQuery

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ error: 'No Microsoft account connected' }, { status: 404 })
    }

    const results = []

    for (const token of tokens) {
      try {
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
            sync_type: fullSync ? 'full' : 'delta',
            delta_token_before: token.mail_delta_token,
          })
          .select('id')
          .single()

        // Perform sync
        const deltaToken = fullSync ? undefined : token.mail_delta_token
        let messages: GraphMessage[] = []
        let newDeltaToken: string | undefined
        let nextLink: string | undefined = deltaToken || undefined

        // Fetch all pages
        do {
          const response = await listEmailsDelta(accessToken, {
            folderId: 'inbox',
            deltaToken: nextLink,
          })

          messages = [...messages, ...response.value]
          nextLink = response['@odata.nextLink']
          newDeltaToken = response['@odata.deltaLink'] || newDeltaToken
        } while (nextLink && !nextLink.includes('deltaLink'))

        // Process messages
        let created = 0
        let updated = 0

        for (const msg of messages) {
          const emailData = convertGraphMessageToEmail(msg, emailAccount.id)

          // Check if email already exists
          const { data: existing } = await supabaseAdmin
            .from('emails')
            .select('id')
            .eq('graph_message_id', msg.id)
            .single()

          if (existing) {
            // Update existing
            await supabaseAdmin
              .from('emails')
              .update({
                is_read: msg.isRead,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
            updated++
          } else {
            // Create new - first create or find thread
            const threadId = await getOrCreateThread(
              supabaseAdmin,
              emailAccount.id,
              msg,
              profile.id
            )

            // Insert email
            await supabaseAdmin.from('emails').insert({
              ...emailData,
              thread_id: threadId,
            })
            created++
          }
        }

        // Update sync log
        await supabaseAdmin
          .from('microsoft_sync_log')
          .update({
            status: 'completed',
            messages_synced: messages.length,
            messages_created: created,
            messages_updated: updated,
            delta_token_after: newDeltaToken,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog?.id)

        // Update token with new delta token
        if (newDeltaToken) {
          await supabaseAdmin
            .from('microsoft_oauth_tokens')
            .update({
              mail_delta_token: newDeltaToken,
              last_sync_at: new Date().toISOString(),
            })
            .eq('id', token.id)
        }

        results.push({
          tokenId: token.id,
          email: token.email,
          success: true,
          messagesProcessed: messages.length,
          created,
          updated,
        })
      } catch (error) {
        console.error(`Sync error for token ${token.id}:`, error)
        results.push({
          tokenId: token.id,
          email: token.email,
          error: (error as Error).message,
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Microsoft sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

/**
 * Converts a Graph message to our email format
 */
function convertGraphMessageToEmail(msg: GraphMessage, emailAccountId: string) {
  const from = extractEmailFromRecipient(msg.from || msg.sender)
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
    is_inbound: true,
    status: 'delivered',
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
  userId: string
) {
  // Try to find existing thread by conversation ID
  const { data: existingThread } = await supabase
    .from('email_threads')
    .select('id')
    .eq('email_account_id', emailAccountId)
    .contains('participants', [{ conversationId: msg.conversationId }])
    .single()

  if (existingThread) {
    // Get current counts
    const { data: currentThread } = await supabase
      .from('email_threads')
      .select('message_count, unread_count')
      .eq('id', existingThread.id)
      .single()

    // Update thread with incremented counts
    await supabase
      .from('email_threads')
      .update({
        last_message_at: msg.receivedDateTime,
        message_count: (currentThread?.message_count || 0) + 1,
        unread_count: msg.isRead ? currentThread?.unread_count || 0 : (currentThread?.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingThread.id)

    return existingThread.id
  }

  // Try to find by subject (fallback)
  const cleanSubject = msg.subject?.replace(/^(Re:|Fwd:|RE:|FW:)\s*/gi, '').trim()
  if (cleanSubject) {
    const { data: subjectThread } = await supabase
      .from('email_threads')
      .select('id')
      .eq('email_account_id', emailAccountId)
      .ilike('subject', cleanSubject)
      .single()

    if (subjectThread) {
      return subjectThread.id
    }
  }

  // Create new thread
  const participants = [
    ...(msg.from ? [extractEmailFromRecipient(msg.from)] : []),
    ...(msg.toRecipients?.map(extractEmailFromRecipient) || []),
  ]

  const { data: newThread } = await supabase
    .from('email_threads')
    .insert({
      email_account_id: emailAccountId,
      subject: msg.subject,
      participants: [...participants, { conversationId: msg.conversationId }],
      last_message_at: msg.receivedDateTime,
      message_count: 1,
      unread_count: msg.isRead ? 0 : 1,
      has_attachments: msg.hasAttachments,
      is_read: msg.isRead,
      folder: 'inbox',
    })
    .select('id')
    .single()

  return newThread?.id
}
