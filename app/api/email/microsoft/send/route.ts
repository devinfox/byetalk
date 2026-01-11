import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail, createRecipient } from '@/lib/microsoft-graph'
import {
  refreshMicrosoftToken,
  isTokenExpired,
  calculateExpiresAt,
} from '@/lib/microsoft-auth'
import { createClient } from '@/lib/supabase-server'
import { GraphRecipient } from '@/types/microsoft.types'

interface SendMicrosoftEmailRequest {
  accountId: string // Email account ID
  to: Array<{ email: string; name?: string }>
  cc?: Array<{ email: string; name?: string }>
  bcc?: Array<{ email: string; name?: string }>
  subject: string
  bodyHtml?: string
  bodyText?: string
  attachments?: Array<{
    name: string
    contentType: string
    contentBytes: string // Base64
  }>
  threadId?: string
  leadId?: string
  contactId?: string
  dealId?: string
}

/**
 * POST /api/email/microsoft/send
 * Sends an email via Microsoft Graph API
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
    const { data: profile } = await getSupabaseAdmin()
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const body: SendMicrosoftEmailRequest = await request.json()

    // Validate required fields
    if (!body.accountId || !body.to?.length || !body.subject) {
      return NextResponse.json(
        { error: 'Missing required fields: accountId, to, subject' },
        { status: 400 }
      )
    }

    // Get email account
    const { data: emailAccount } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('*, microsoft_token:microsoft_oauth_tokens(*)')
      .eq('id', body.accountId)
      .eq('user_id', profile.id)
      .eq('provider', 'microsoft')
      .single()

    if (!emailAccount) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
    }

    if (!emailAccount.microsoft_token) {
      return NextResponse.json({ error: 'Microsoft account not linked' }, { status: 400 })
    }

    const token = emailAccount.microsoft_token

    // Check if token needs refresh
    let accessToken = token.access_token
    if (isTokenExpired(token.expires_at)) {
      const newTokens = await refreshMicrosoftToken(token.refresh_token)
      accessToken = newTokens.access_token

      // Update stored tokens
      await getSupabaseAdmin()
        .from('microsoft_oauth_tokens')
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          expires_at: calculateExpiresAt(newTokens.expires_in).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', token.id)
    }

    // Convert recipients to Graph format
    const toRecipients: GraphRecipient[] = body.to.map((r) => createRecipient(r.email, r.name))
    const ccRecipients: GraphRecipient[] = body.cc?.map((r) => createRecipient(r.email, r.name)) || []
    const bccRecipients: GraphRecipient[] = body.bcc?.map((r) => createRecipient(r.email, r.name)) || []

    // Prepare attachments
    const attachments = body.attachments?.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBytes,
    }))

    // Create email record in database first (status: sending)
    const emailRecord = {
      email_account_id: body.accountId,
      from_address: emailAccount.email_address,
      from_name: emailAccount.display_name,
      to_addresses: body.to,
      cc_addresses: body.cc || [],
      bcc_addresses: body.bcc || [],
      subject: body.subject,
      body_html: body.bodyHtml,
      body_text: body.bodyText,
      snippet: body.bodyText?.substring(0, 200) || body.bodyHtml?.replace(/<[^>]*>/g, '').substring(0, 200),
      is_inbound: false,
      status: 'sending',
      email_provider: 'microsoft',
      thread_id: body.threadId,
      lead_id: body.leadId,
      contact_id: body.contactId,
      deal_id: body.dealId,
      has_attachments: !!attachments?.length,
    }

    const { data: newEmail, error: insertError } = await getSupabaseAdmin()
      .from('emails')
      .insert(emailRecord)
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to create email record:', insertError)
      return NextResponse.json({ error: 'Failed to create email record' }, { status: 500 })
    }

    try {
      // Send via Microsoft Graph
      await sendEmail(accessToken, {
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: body.subject,
        body: {
          contentType: body.bodyHtml ? 'html' : 'text',
          content: body.bodyHtml || body.bodyText || '',
        },
        attachments,
        saveToSentItems: true,
      })

      // Update email record to sent
      await getSupabaseAdmin()
        .from('emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', newEmail.id)

      // Update thread if exists
      if (body.threadId) {
        await getSupabaseAdmin()
          .from('email_threads')
          .update({
            last_message_at: new Date().toISOString(),
            folder: 'sent',
          })
          .eq('id', body.threadId)
      }

      return NextResponse.json({
        success: true,
        emailId: newEmail.id,
      })
    } catch (sendError) {
      console.error('Failed to send via Microsoft:', sendError)

      // Update email record to failed
      await getSupabaseAdmin()
        .from('emails')
        .update({
          status: 'failed',
        })
        .eq('id', newEmail.id)

      return NextResponse.json(
        { error: (sendError as Error).message },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Microsoft send error:', error)
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
}
