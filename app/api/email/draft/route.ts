import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let openaiInstance: OpenAI | null = null

// Auto-expire old pending drafts (older than 7 days)
const DRAFT_EXPIRATION_DAYS = 7

async function expireOldDrafts(): Promise<{ expiredCount: number }> {
  const expirationDate = new Date()
  expirationDate.setDate(expirationDate.getDate() - DRAFT_EXPIRATION_DAYS)

  const { data: expiredDrafts, error: fetchError } = await supabaseAdmin
    .from('email_drafts')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', expirationDate.toISOString())

  if (fetchError || !expiredDrafts || expiredDrafts.length === 0) {
    return { expiredCount: 0 }
  }

  const expiredIds = expiredDrafts.map(d => d.id)

  const { error: updateError } = await supabaseAdmin
    .from('email_drafts')
    .update({
      status: 'expired',
      dismissed_at: new Date().toISOString()
    })
    .in('id', expiredIds)

  if (updateError) {
    console.error('[Email Draft API] Failed to expire old drafts:', updateError)
    return { expiredCount: 0 }
  }

  console.log(`[Email Draft API] Expired ${expiredIds.length} old drafts`)
  return { expiredCount: expiredIds.length }
}

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

interface DraftRequest {
  user_id: string
  lead_id: string
  call_id?: string
  content_hints: string[]
  tone?: string
  document_ids?: string[]
  due_at?: string
  commitment_quote?: string
}

/**
 * POST /api/email/draft
 * Generate an AI email draft based on call context and conversation history
 */
export async function POST(request: NextRequest) {
  try {
    const body: DraftRequest = await request.json()
    const {
      user_id,
      lead_id,
      call_id,
      content_hints,
      tone = 'professional',
      document_ids = [],
      due_at,
      commitment_quote
    } = body

    if (!user_id || !lead_id) {
      return NextResponse.json(
        { error: 'user_id and lead_id are required' },
        { status: 400 }
      )
    }

    // 1. Fetch lead info
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, first_name, last_name, email, phone')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 })
    }

    // 2. Fetch user info
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('id', user_id)
      .single()

    const userName = userProfile
      ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
      : 'Sales Representative'

    // 3. Fetch user's primary email account
    const { data: emailAccount } = await supabaseAdmin
      .from('email_accounts')
      .select('id, email_address, display_name')
      .eq('user_id', user_id)
      .eq('is_primary', true)
      .single()

    // 4. Fetch call transcription if call_id provided
    let callTranscript = ''
    if (call_id) {
      const { data: call } = await supabaseAdmin
        .from('calls')
        .select('transcription, ai_summary')
        .eq('id', call_id)
        .single()

      if (call) {
        callTranscript = call.transcription || call.ai_summary || ''
      }
    }

    // 5. Fetch recent email history with this lead
    const { data: recentEmails } = await supabaseAdmin
      .from('emails')
      .select('subject, body_text, from_address, is_inbound, created_at')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(5)

    const emailHistory = recentEmails?.map(e => ({
      direction: e.is_inbound ? 'from lead' : 'to lead',
      subject: e.subject,
      snippet: (e.body_text || '').substring(0, 200),
      date: e.created_at
    })) || []

    // 6. Fetch document details if document_ids provided
    let attachmentInfo: string[] = []
    if (document_ids.length > 0) {
      const { data: docs } = await supabaseAdmin
        .from('documents')
        .select('id, file_name')
        .in('id', document_ids)

      attachmentInfo = docs?.map(d => d.file_name) || []
    }

    // 7. Generate email draft using AI
    const openai = getOpenAI()
    if (!openai) {
      return NextResponse.json(
        { error: 'AI service unavailable' },
        { status: 503 }
      )
    }

    const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'there'

    const prompt = `You are drafting an email for ${userName}, a sales representative at Citadel Gold.

LEAD INFORMATION:
- Name: ${leadName}
- Email: ${lead.email}

${callTranscript ? `RECENT CALL TRANSCRIPT (reference naturally, don't quote directly):
${callTranscript.substring(0, 2000)}
` : ''}

${emailHistory.length > 0 ? `PREVIOUS EMAIL HISTORY:
${emailHistory.map(e => `- ${e.direction}: "${e.subject}" - ${e.snippet}...`).join('\n')}
` : ''}

WHAT TO INCLUDE IN THIS EMAIL:
${content_hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}

${attachmentInfo.length > 0 ? `DOCUMENTS BEING ATTACHED:
${attachmentInfo.map(f => `- ${f}`).join('\n')}
` : ''}

${commitment_quote ? `ORIGINAL COMMITMENT MADE:
"${commitment_quote}"
` : ''}

TONE: ${tone}

Write a professional email that:
1. Addresses ${leadName} warmly
2. References the recent conversation naturally (if applicable)
3. Delivers on the promise to send the mentioned information/documents
4. Mentions the attached documents if any
5. Has a clear call-to-action (schedule a call, review documents, etc.)
6. Is concise but personable
7. Signs off as ${userName}

Return ONLY a JSON object with:
{
  "subject": "email subject line",
  "body_html": "email body with <p>, <br>, <strong> HTML tags for formatting",
  "body_text": "plain text version of the email"
}

Do NOT include any markdown formatting. Return valid JSON only.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert sales email writer. Write warm, professional emails that build rapport and move deals forward. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    })

    const responseText = response.choices[0]?.message?.content?.trim()
    if (!responseText) {
      return NextResponse.json(
        { error: 'Failed to generate email draft' },
        { status: 500 }
      )
    }

    // Parse response
    let jsonStr = responseText
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const draftContent = JSON.parse(jsonStr)

    // 8. Save draft to database
    const { data: draft, error: insertError } = await supabaseAdmin
      .from('email_drafts')
      .insert({
        user_id,
        lead_id,
        call_id: call_id || null,
        from_account_id: emailAccount?.id || null,
        to_email: lead.email,
        to_name: leadName,
        subject: draftContent.subject,
        body_html: draftContent.body_html,
        body_text: draftContent.body_text,
        attachment_ids: document_ids,
        due_at: due_at || null,
        status: 'pending',
        ai_generated: true,
        commitment_quote: commitment_quote || null
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error saving draft:', insertError)
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      )
    }

    // 9. Return draft details
    return NextResponse.json({
      draft_id: draft.id,
      subject: draftContent.subject,
      body_html: draftContent.body_html,
      body_text: draftContent.body_text,
      attachments: attachmentInfo.map((name, i) => ({
        id: document_ids[i],
        file_name: name
      })),
      lead_name: leadName,
      lead_email: lead.email,
      due_at
    })

  } catch (error) {
    console.error('Error generating email draft:', error)
    return NextResponse.json(
      { error: 'Failed to generate email draft' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/email/draft?id=<draft_id>
 * Fetch a specific draft
 *
 * GET /api/email/draft?expire=true
 * Run draft expiration cleanup (expires drafts older than 7 days)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get('id')
    const shouldExpire = searchParams.get('expire') === 'true'

    // If expire=true, run the expiration cleanup
    if (shouldExpire) {
      const result = await expireOldDrafts()
      return NextResponse.json({
        success: true,
        expiredCount: result.expiredCount,
        message: result.expiredCount > 0
          ? `Expired ${result.expiredCount} old draft(s)`
          : 'No drafts to expire'
      })
    }

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 })
    }

    // Run expiration in background when fetching a specific draft
    expireOldDrafts().catch(err => console.error('[Email Draft API] Background expiration failed:', err))

    const { data: draft, error } = await supabaseAdmin
      .from('email_drafts')
      .select(`
        *,
        lead:leads(id, first_name, last_name, email),
        call:calls(id, transcription, ai_summary)
      `)
      .eq('id', draftId)
      .single()

    if (error || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    // Fetch attachment details
    let attachments: any[] = []
    if (draft.attachment_ids?.length > 0) {
      const { data: docs } = await supabaseAdmin
        .from('documents')
        .select('id, file_name, public_url, mime_type, file_size_bytes')
        .in('id', draft.attachment_ids)

      attachments = docs || []
    }

    return NextResponse.json({
      ...draft,
      attachments
    })

  } catch (error) {
    console.error('Error fetching draft:', error)
    return NextResponse.json(
      { error: 'Failed to fetch draft' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/email/draft
 * Update draft status (sent, dismissed)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { draft_id, status } = body

    if (!draft_id || !status) {
      return NextResponse.json(
        { error: 'draft_id and status required' },
        { status: 400 }
      )
    }

    if (!['sent', 'dismissed', 'expired'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      )
    }

    // First, get the draft to check for linked task
    const { data: draft, error: fetchError } = await supabaseAdmin
      .from('email_drafts')
      .select('task_id, to_name')
      .eq('id', draft_id)
      .single()

    console.log('[Email Draft API] Fetched draft for PATCH:', { draft_id, draft, fetchError })

    const updateData: any = { status }
    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString()
    } else if (status === 'dismissed' || status === 'expired') {
      updateData.dismissed_at = new Date().toISOString()
    }

    const { error } = await supabaseAdmin
      .from('email_drafts')
      .update(updateData)
      .eq('id', draft_id)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update draft' },
        { status: 500 }
      )
    }

    // If draft was sent and has a linked task, mark task as completed
    let taskCompleted = false
    if (status === 'sent' && draft?.task_id) {
      const { error: taskError } = await supabaseAdmin
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', draft.task_id)

      if (!taskError) {
        taskCompleted = true
        console.log('[Email Draft API] Linked task marked as complete:', draft.task_id)
      } else {
        console.error('[Email Draft API] Failed to complete linked task:', taskError)
      }
    }

    return NextResponse.json({
      success: true,
      taskCompleted,
      taskId: draft?.task_id || null,
      recipientName: draft?.to_name || null
    })

  } catch (error) {
    console.error('Error updating draft:', error)
    return NextResponse.json(
      { error: 'Failed to update draft' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/email/draft?id=<draft_id>
 * Permanently delete a draft and optionally its linked task
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get('id')
    const deleteTask = searchParams.get('deleteTask') === 'true'

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 })
    }

    // Get the draft first to check for linked task
    const { data: draft } = await supabaseAdmin
      .from('email_drafts')
      .select('task_id')
      .eq('id', draftId)
      .single()

    // Delete the draft
    const { error: deleteError } = await supabaseAdmin
      .from('email_drafts')
      .delete()
      .eq('id', draftId)

    if (deleteError) {
      console.error('Error deleting draft:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete draft' },
        { status: 500 }
      )
    }

    // If requested and there's a linked task, delete it too
    let taskDeleted = false
    if (deleteTask && draft?.task_id) {
      const { error: taskError } = await supabaseAdmin
        .from('tasks')
        .delete()
        .eq('id', draft.task_id)

      if (!taskError) {
        taskDeleted = true
        console.log('[Email Draft API] Linked task deleted:', draft.task_id)
      } else {
        console.error('[Email Draft API] Failed to delete linked task:', taskError)
      }
    }

    return NextResponse.json({
      success: true,
      taskDeleted,
      deletedTaskId: draft?.task_id || null
    })

  } catch (error) {
    console.error('Error deleting draft:', error)
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500 }
    )
  }
}
