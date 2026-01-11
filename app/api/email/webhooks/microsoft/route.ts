import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getEmail, extractEmailFromRecipient } from '@/lib/microsoft-graph'
import {
  refreshMicrosoftToken,
  isTokenExpired,
  calculateExpiresAt,
} from '@/lib/microsoft-auth'
import { GraphWebhookNotification } from '@/types/microsoft.types'

/**
 * POST /api/email/webhooks/microsoft
 * Handles webhook notifications from Microsoft Graph API
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Handle validation request (Microsoft sends this when creating subscription)
  const validationToken = searchParams.get('validationToken')
  if (validationToken) {
    // Return the token as plain text to validate the endpoint
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  try {
    const body: GraphWebhookNotification = await request.json()

    // Process each notification
    for (const notification of body.value) {
      const { subscriptionId, changeType, resourceData, clientState } = notification

      // Validate client state (should match what we set when creating subscription)
      // In production, verify this matches your expected client state

      // Find the token by subscription ID
      const { data: token } = await getSupabaseAdmin()
        .from('microsoft_oauth_tokens')
        .select('*, email_accounts!microsoft_oauth_tokens_user_id_fkey(id)')
        .eq('webhook_subscription_id', subscriptionId)
        .single()

      if (!token) {
        console.warn(`No token found for subscription ${subscriptionId}`)
        continue
      }

      // Get access token (refresh if needed)
      let accessToken = token.access_token
      if (isTokenExpired(token.expires_at)) {
        try {
          const newTokens = await refreshMicrosoftToken(token.refresh_token)
          accessToken = newTokens.access_token

          await getSupabaseAdmin()
            .from('microsoft_oauth_tokens')
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              expires_at: calculateExpiresAt(newTokens.expires_in).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', token.id)
        } catch (refreshError) {
          console.error('Failed to refresh token for webhook:', refreshError)
          continue
        }
      }

      // Get email account
      const { data: emailAccount } = await getSupabaseAdmin()
        .from('email_accounts')
        .select('id')
        .eq('microsoft_token_id', token.id)
        .single()

      if (!emailAccount) {
        console.warn(`No email account for token ${token.id}`)
        continue
      }

      // Handle different change types
      switch (changeType) {
        case 'created':
          await handleNewEmail(accessToken, resourceData.id, emailAccount.id, token.user_id)
          break

        case 'updated':
          await handleUpdatedEmail(accessToken, resourceData.id)
          break

        case 'deleted':
          await handleDeletedEmail(resourceData.id)
          break
      }
    }

    // Always return 202 to acknowledge receipt
    return NextResponse.json({ status: 'processed' }, { status: 202 })
  } catch (error) {
    console.error('Microsoft webhook error:', error)
    // Return 202 anyway to prevent retries on processing errors
    return NextResponse.json({ status: 'error' }, { status: 202 })
  }
}

/**
 * Handles a new email notification
 */
async function handleNewEmail(
  accessToken: string,
  messageId: string,
  emailAccountId: string,
  userId: string
) {
  try {
    // Fetch the full message from Graph
    const msg = await getEmail(accessToken, messageId)

    // Check if already exists
    const { data: existing } = await getSupabaseAdmin()
      .from('emails')
      .select('id')
      .eq('graph_message_id', messageId)
      .single()

    if (existing) {
      return // Already processed
    }

    // Find or create thread
    const threadId = await findOrCreateThread(emailAccountId, msg)

    // Convert and insert email
    const from = extractEmailFromRecipient(msg.from || msg.sender)
    const to = msg.toRecipients?.map(extractEmailFromRecipient) || []
    const cc = msg.ccRecipients?.map(extractEmailFromRecipient) || []

    await getSupabaseAdmin().from('emails').insert({
      email_account_id: emailAccountId,
      thread_id: threadId,
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
      has_attachments: msg.hasAttachments,
      email_provider: 'microsoft',
      graph_message_id: msg.id,
      graph_conversation_id: msg.conversationId,
      graph_internet_message_id: msg.internetMessageId,
    })

    // Update thread counts
    if (threadId) {
      const { data: thread } = await getSupabaseAdmin()
        .from('email_threads')
        .select('message_count, unread_count')
        .eq('id', threadId)
        .single()

      await getSupabaseAdmin()
        .from('email_threads')
        .update({
          last_message_at: msg.receivedDateTime,
          message_count: (thread?.message_count || 0) + 1,
          unread_count: msg.isRead ? thread?.unread_count || 0 : (thread?.unread_count || 0) + 1,
          has_attachments: msg.hasAttachments || undefined,
        })
        .eq('id', threadId)
    }

    console.log(`Created email from webhook: ${messageId}`)
  } catch (error) {
    console.error(`Failed to handle new email ${messageId}:`, error)
  }
}

/**
 * Handles an updated email notification
 */
async function handleUpdatedEmail(accessToken: string, messageId: string) {
  try {
    // Fetch updated message
    const msg = await getEmail(accessToken, messageId)

    // Update local record
    await getSupabaseAdmin()
      .from('emails')
      .update({
        is_read: msg.isRead,
        read_at: msg.isRead ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('graph_message_id', messageId)

    console.log(`Updated email from webhook: ${messageId}`)
  } catch (error) {
    console.error(`Failed to handle updated email ${messageId}:`, error)
  }
}

/**
 * Handles a deleted email notification
 */
async function handleDeletedEmail(messageId: string) {
  try {
    // Soft delete local record
    await getSupabaseAdmin()
      .from('emails')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('graph_message_id', messageId)

    console.log(`Deleted email from webhook: ${messageId}`)
  } catch (error) {
    console.error(`Failed to handle deleted email ${messageId}:`, error)
  }
}

/**
 * Finds or creates an email thread
 */
async function findOrCreateThread(emailAccountId: string, msg: any): Promise<string | null> {
  // Try to find by conversation ID
  const { data: emails } = await getSupabaseAdmin()
    .from('emails')
    .select('thread_id')
    .eq('graph_conversation_id', msg.conversationId)
    .eq('email_account_id', emailAccountId)
    .limit(1)

  if (emails?.[0]?.thread_id) {
    return emails[0].thread_id
  }

  // Try to find by subject
  const cleanSubject = msg.subject?.replace(/^(Re:|Fwd:|RE:|FW:)\s*/gi, '').trim()
  if (cleanSubject) {
    const { data: threadBySubject } = await getSupabaseAdmin()
      .from('email_threads')
      .select('id')
      .eq('email_account_id', emailAccountId)
      .ilike('subject', cleanSubject)
      .single()

    if (threadBySubject) {
      return threadBySubject.id
    }
  }

  // Create new thread
  const from = extractEmailFromRecipient(msg.from || msg.sender)
  const to = msg.toRecipients?.map(extractEmailFromRecipient) || []

  const { data: newThread } = await getSupabaseAdmin()
    .from('email_threads')
    .insert({
      email_account_id: emailAccountId,
      subject: msg.subject,
      participants: [from, ...to],
      last_message_at: msg.receivedDateTime || new Date().toISOString(),
      message_count: 0,
      unread_count: 0,
      has_attachments: msg.hasAttachments,
      is_read: msg.isRead,
      folder: 'inbox',
    })
    .select('id')
    .single()

  return newThread?.id || null
}
