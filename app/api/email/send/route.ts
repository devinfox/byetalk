import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/sendgrid'
import { generateMessageId, parseEmailAddress, generateSnippet, stripHtml } from '@/lib/email-utils'
import { EmailParticipant } from '@/types/email.types'
import { v4 as uuidv4 } from 'uuid'
import { processEmailForAI } from '@/lib/email-ai'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/email/send - Send an email
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from users table
    let { data: userData } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('auth_id', user.id)
      .single()

    // Auto-create user if not found
    if (!userData) {
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || ''
      const nameParts = fullName.split(' ')
      const firstName = nameParts[0] || user.email?.split('@')[0] || 'User'
      const lastName = nameParts.slice(1).join(' ') || ''

      const { data: newUser, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_id: user.id,
          email: user.email,
          first_name: firstName,
          last_name: lastName,
          role: 'sales_rep',
          is_active: true
        })
        .select('id, first_name, last_name')
        .single()

      if (createError) {
        console.error('Error creating user:', createError)
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      userData = newUser
    }

    const body = await request.json()
    const {
      from_account_id,
      to,
      cc,
      bcc,
      subject,
      body_text,
      body_html,
      reply_to_email_id,
      thread_id,
      attachments,
      schedule_at,
    } = body

    // Validate required fields
    if (!from_account_id) {
      return NextResponse.json({ error: 'From account is required' }, { status: 400 })
    }

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
    }

    if (!subject && !reply_to_email_id) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    if (!body_text && !body_html) {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 })
    }

    // Get the sender's email account (use admin to bypass RLS for domain join)
    const { data: fromAccount } = await supabaseAdmin
      .from('email_accounts')
      .select(`
        *,
        domain:email_domains(id, domain, verification_status, sendgrid_domain_id)
      `)
      .eq('id', from_account_id)
      .eq('user_id', userData.id)
      .eq('is_deleted', false)
      .single()

    if (!fromAccount) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
    }

    // Check if domain is verified
    if (fromAccount.domain?.verification_status !== 'verified') {
      return NextResponse.json(
        { error: 'Domain is not verified. Please complete DNS verification before sending emails.' },
        { status: 400 }
      )
    }

    // Parse recipients
    const toRecipients: EmailParticipant[] = to.map((email: string) => parseEmailAddress(email))
    const ccRecipients: EmailParticipant[] = cc?.map((email: string) => parseEmailAddress(email)) || []
    const bccRecipients: EmailParticipant[] = bcc?.map((email: string) => parseEmailAddress(email)) || []

    // Generate message ID
    const messageId = generateMessageId(fromAccount.domain.domain)

    // Get reply headers if this is a reply
    let inReplyTo: string | null = null
    let references: string | null = null
    let existingThreadId = thread_id

    if (reply_to_email_id) {
      const { data: replyToEmail } = await supabase
        .from('emails')
        .select('message_id, references, thread_id, subject')
        .eq('id', reply_to_email_id)
        .single()

      if (replyToEmail) {
        inReplyTo = replyToEmail.message_id
        const existingRefs = replyToEmail.references ? replyToEmail.references.split(' ') : []
        if (replyToEmail.message_id && !existingRefs.includes(replyToEmail.message_id)) {
          existingRefs.push(replyToEmail.message_id)
        }
        references = existingRefs.join(' ')
        existingThreadId = replyToEmail.thread_id
      }
    }

    // Create or get thread
    let finalThreadId = existingThreadId

    if (!finalThreadId) {
      // Create new thread
      const { data: newThread, error: threadError } = await supabaseAdmin
        .from('email_threads')
        .insert({
          email_account_id: from_account_id,
          subject: subject || '(no subject)',
          folder: 'sent',
          is_read: true,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (threadError) {
        console.error('Error creating thread:', threadError)
        console.error('Attempted with email_account_id:', from_account_id)
        return NextResponse.json({ error: 'Failed to create email thread: ' + threadError.message }, { status: 500 })
      }

      finalThreadId = newThread.id
    }

    // Build email headers
    const headers: Record<string, string> = {
      'Message-ID': `<${messageId}>`,
    }

    if (inReplyTo) {
      headers['In-Reply-To'] = inReplyTo
    }

    if (references) {
      headers['References'] = references
    }

    // Create email record in database (status: sending)
    const emailId = uuidv4()
    const { error: emailError } = await supabaseAdmin
      .from('emails')
      .insert({
        id: emailId,
        thread_id: finalThreadId,
        email_account_id: from_account_id,
        message_id: `<${messageId}>`,
        in_reply_to: inReplyTo,
        references_header: references ? references.split(' ') : null,
        from_address: fromAccount.email_address,
        from_name: fromAccount.display_name,
        to_addresses: toRecipients.map(r => ({ email: r.email, name: r.name || null })),
        cc_addresses: ccRecipients.length > 0 ? ccRecipients.map(r => ({ email: r.email, name: r.name || null })) : [],
        bcc_addresses: bccRecipients.length > 0 ? bccRecipients.map(r => ({ email: r.email, name: r.name || null })) : [],
        subject: subject || '',
        body_text,
        body_html,
        snippet: generateSnippet(body_text || stripHtml(body_html || '')),
        status: schedule_at ? 'queued' : 'sending',
        is_inbound: false,
        is_read: true,
        scheduled_at: schedule_at || null,
      })

    if (emailError) {
      console.error('Error creating email record:', emailError)
      return NextResponse.json({ error: 'Failed to create email record: ' + emailError.message }, { status: 500 })
    }

    // Handle attachments if provided
    if (attachments && attachments.length > 0) {
      const attachmentRecords = attachments.map((att: any) => ({
        email_id: emailId,
        filename: att.filename,
        content_type: att.content_type || 'application/octet-stream',
        size: att.size || 0,
        storage_path: att.storage_path,
        content_id: att.content_id || null,
        is_inline: att.is_inline || false,
      }))

      await supabaseAdmin.from('email_attachments').insert(attachmentRecords)
    }

    // If scheduled, don't send now
    if (schedule_at) {
      return NextResponse.json({
        success: true,
        email_id: emailId,
        thread_id: finalThreadId,
        scheduled_for: schedule_at,
        message: 'Email scheduled successfully',
      })
    }

    // Send via SendGrid
    try {
      // Prepare SendGrid attachments
      const sgAttachments = attachments?.map((att: any) => ({
        content: att.content, // base64 encoded
        filename: att.filename,
        type: att.content_type,
        disposition: att.is_inline ? 'inline' : 'attachment',
        contentId: att.content_id,
      }))

      const result = await sendEmail({
        to: toRecipients,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
        from: {
          email: fromAccount.email_address,
          name: fromAccount.display_name || undefined,
        },
        subject: subject || '',
        text: body_text,
        html: body_html,
        headers,
        attachments: sgAttachments,
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true },
        },
      })

      // Update email status to sent
      await supabaseAdmin
        .from('emails')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sendgrid_message_id: result.messageId,
        })
        .eq('id', emailId)

      // Update thread's last_message_at
      await supabaseAdmin
        .from('email_threads')
        .update({
          last_message_at: new Date().toISOString(),
          snippet: generateSnippet(body_text || stripHtml(body_html || '')),
        })
        .eq('id', finalThreadId)

      // Process email for AI analysis, lead linking, and task generation (async, don't wait)
      processEmailForAI(
        emailId,
        fromAccount.email_address,
        fromAccount.display_name,
        toRecipients.map(r => r.email),
        subject || '',
        body_text,
        body_html,
        false, // isInbound = false for outgoing
        userData.id
      ).then((aiResult) => {
        console.log(`AI processing complete for sent email ${emailId}:`, {
          linkedLead: aiResult.linkedLead,
          linkedContact: aiResult.linkedContact,
          tasksCreated: aiResult.tasksCreated.length,
          hasSummary: !!aiResult.analysis?.summary,
        })
      }).catch((err) => {
        console.error(`AI processing failed for sent email ${emailId}:`, err)
      })

      return NextResponse.json({
        success: true,
        email_id: emailId,
        thread_id: finalThreadId,
        sendgrid_message_id: result.messageId,
      })
    } catch (sendError: any) {
      console.error('SendGrid send error:', sendError)

      // Update email status to failed
      await supabaseAdmin
        .from('emails')
        .update({
          status: 'failed',
          error_message: sendError.message || 'Failed to send email',
        })
        .eq('id', emailId)

      return NextResponse.json(
        { error: 'Failed to send email', details: sendError.message },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Email send error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
