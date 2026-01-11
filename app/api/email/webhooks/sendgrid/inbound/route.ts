import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseEmailAddress, generateSnippet, stripHtml, parseReferences } from '@/lib/email-utils'
import { v4 as uuidv4 } from 'uuid'
import { processEmailForAI } from '@/lib/email-ai'

// POST /api/email/webhooks/sendgrid/inbound - Handle inbound emails from SendGrid
export async function POST(request: NextRequest) {
  try {
    // Parse the multipart form data from SendGrid
    const formData = await request.formData()

    // Extract email data from SendGrid's Inbound Parse
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const cc = formData.get('cc') as string | null
    const subject = formData.get('subject') as string
    const text = formData.get('text') as string | null
    const html = formData.get('html') as string | null
    const headers = formData.get('headers') as string | null
    const envelope = formData.get('envelope') as string | null
    const attachments = formData.get('attachments') as string | null
    const attachmentInfo = formData.get('attachment-info') as string | null
    const spamScore = formData.get('spam_score') as string | null
    const spamReport = formData.get('spam_report') as string | null

    console.log('Inbound email received:', { from, to, subject })

    // Parse sender
    const fromParsed = parseEmailAddress(from)

    // Parse recipients
    const toAddresses = to ? to.split(',').map(e => parseEmailAddress(e.trim()).email) : []
    const ccAddresses = cc ? cc.split(',').map(e => parseEmailAddress(e.trim()).email) : []

    // Find matching email account
    const { data: matchingAccounts } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('id, email_address, user_id')
      .in('email_address', [...toAddresses, ...ccAddresses])
      .eq('is_deleted', false)
      .eq('is_active', true)

    if (!matchingAccounts || matchingAccounts.length === 0) {
      console.log('No matching email accounts found for:', toAddresses)
      return NextResponse.json({ received: true, processed: false, reason: 'No matching account' })
    }

    // Parse headers for threading
    let messageId: string | null = null
    let inReplyTo: string | null = null
    let references: string | null = null

    if (headers) {
      const headerLines = headers.split('\n')
      for (const line of headerLines) {
        if (line.toLowerCase().startsWith('message-id:')) {
          messageId = line.substring('message-id:'.length).trim()
        } else if (line.toLowerCase().startsWith('in-reply-to:')) {
          inReplyTo = line.substring('in-reply-to:'.length).trim()
        } else if (line.toLowerCase().startsWith('references:')) {
          references = line.substring('references:'.length).trim()
        }
      }
    }

    // Determine if this is spam
    const isSpam = spamScore ? parseFloat(spamScore) > 5.0 : false

    // Process for each matching account
    for (const account of matchingAccounts) {
      // Try to find existing thread
      let threadId: string | null = null

      if (inReplyTo || references) {
        // Search for thread by message IDs
        const refsToSearch = [inReplyTo, ...(references ? parseReferences(references) : [])].filter(Boolean)

        if (refsToSearch.length > 0) {
          const { data: existingEmail } = await getSupabaseAdmin()
            .from('emails')
            .select('thread_id')
            .eq('email_account_id', account.id)
            .or(refsToSearch.map(r => `message_id.eq.${r}`).join(','))
            .limit(1)
            .single()

          if (existingEmail) {
            threadId = existingEmail.thread_id
          }
        }
      }

      // If no existing thread, search by subject
      if (!threadId && subject) {
        // Clean subject for matching
        const cleanSubject = subject
          .replace(/^(re:|fwd:|fw:)\s*/gi, '')
          .trim()
          .toLowerCase()

        const { data: threadBySubject } = await getSupabaseAdmin()
          .from('email_threads')
          .select('id')
          .eq('email_account_id', account.id)
          .ilike('subject', `%${cleanSubject}%`)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .single()

        if (threadBySubject) {
          threadId = threadBySubject.id
        }
      }

      // Create new thread if needed
      if (!threadId) {
        const { data: newThread, error: threadError } = await getSupabaseAdmin()
          .from('email_threads')
          .insert({
            email_account_id: account.id,
            subject: subject || '(no subject)',
            folder: isSpam ? 'spam' : 'inbox',
            is_read: false,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (threadError) {
          console.error('Error creating thread:', threadError)
          continue
        }

        threadId = newThread.id
      } else {
        // Update existing thread
        await getSupabaseAdmin()
          .from('email_threads')
          .update({
            is_read: false,
            last_message_at: new Date().toISOString(),
            folder: isSpam ? 'spam' : 'inbox',
          })
          .eq('id', threadId)
      }

      // Create email record
      const emailId = uuidv4()
      const { error: emailError } = await getSupabaseAdmin()
        .from('emails')
        .insert({
          id: emailId,
          thread_id: threadId,
          email_account_id: account.id,
          message_id: messageId,
          in_reply_to: inReplyTo,
          references_header: references ? references.split(/\s+/) : null,
          from_address: fromParsed.email,
          from_name: fromParsed.name,
          to_addresses: toAddresses.map(email => ({ email, name: null })),
          cc_addresses: ccAddresses.length > 0 ? ccAddresses.map(email => ({ email, name: null })) : [],
          subject: subject || '',
          body_text: text,
          body_html: html,
          snippet: generateSnippet(text || stripHtml(html || '')),
          status: 'delivered',
          is_inbound: true,
          is_read: false,
          headers: headers ? { raw: headers } : null,
        })

      if (emailError) {
        console.error('Error creating email:', emailError)
        continue
      }

      // Handle attachments
      if (attachmentInfo) {
        try {
          const attachmentData = JSON.parse(attachmentInfo)

          for (const [key, info] of Object.entries(attachmentData)) {
            const attInfo = info as any
            const fileData = formData.get(key) as File | null

            if (fileData) {
              // Upload to Supabase Storage
              const storagePath = `emails/${emailId}/${attInfo.filename}`

              const { error: uploadError } = await getSupabaseAdmin().storage
                .from('email-attachments')
                .upload(storagePath, fileData, {
                  contentType: attInfo.type,
                })

              if (uploadError) {
                console.error('Error uploading attachment:', uploadError)
                continue
              }

              // Get public URL
              const { data: { publicUrl } } = getSupabaseAdmin().storage
                .from('email-attachments')
                .getPublicUrl(storagePath)

              // Create attachment record
              await getSupabaseAdmin().from('email_attachments').insert({
                email_id: emailId,
                filename: attInfo.filename,
                content_type: attInfo.type,
                size: fileData.size,
                storage_path: publicUrl,
                content_id: attInfo['content-id'] || null,
                is_inline: attInfo['content-id'] ? true : false,
              })
            }
          }

          // Update thread has_attachments
          await getSupabaseAdmin()
            .from('email_threads')
            .update({ has_attachments: true })
            .eq('id', threadId)
        } catch (attError) {
          console.error('Error processing attachments:', attError)
        }
      }

      console.log(`Email processed for account ${account.email_address}:`, {
        emailId,
        threadId,
        subject,
        from: fromParsed.email,
      })

      // Process email for AI analysis, lead linking, and task generation (async, don't wait)
      processEmailForAI(
        emailId,
        fromParsed.email,
        fromParsed.name || null,
        toAddresses,
        subject || '',
        text || null,
        html || null,
        true, // isInbound
        account.user_id
      ).then((result) => {
        console.log(`AI processing complete for email ${emailId}:`, {
          linkedLead: result.linkedLead,
          linkedContact: result.linkedContact,
          tasksCreated: result.tasksCreated.length,
          hasSummary: !!result.analysis?.summary,
        })
      }).catch((err) => {
        console.error(`AI processing failed for email ${emailId}:`, err)
      })
    }

    return NextResponse.json({ received: true, processed: true })
  } catch (error) {
    console.error('Inbound webhook error:', error)
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}
