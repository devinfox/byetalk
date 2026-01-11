import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


// Server-side lock to prevent parallel processing of the same message
const processingMessages = new Set<string>()

// Lazy initialization to avoid errors when API key is missing
let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

interface EmailDraftRequest {
  should_draft: boolean
  document_hints: string[]
  subject_hint: string
}

interface AnalysisResult {
  isActionable: boolean
  isEmailRequest?: boolean
  emailDraft?: EmailDraftRequest
  task?: {
    title: string
    description: string
    priority: number
    due_days: number
    due_datetime?: string
  }
}

export async function POST(request: NextRequest) {
  let messageIdToUnlock: string | null = null

  try {
    const body = await request.json()
    const { messageId, message, senderName, senderId, recipientId } = body

    console.log('[Chat Analyze API] Received request:', { messageId, message, senderName, senderId, recipientId })

    if (!message || !senderId || !recipientId) {
      console.log('[Chat Analyze API] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Server-side lock: prevent parallel processing of the same message
    if (messageId) {
      if (processingMessages.has(messageId)) {
        console.log('[Chat Analyze API] Message already being processed, skipping:', messageId)
        return NextResponse.json({ isActionable: false, alreadyProcessing: true })
      }
      // Lock this message
      processingMessages.add(messageId)
      messageIdToUnlock = messageId
      console.log('[Chat Analyze API] Locked message for processing:', messageId)
    }

    // Check if we've already processed this message (prevent duplicates)
    // Check for existing task by message_id OR by message content
    const { data: existingTasksById } = await getSupabaseAdmin()
      .from('tasks')
      .select('id, status')
      .eq('source', 'chat_request')
      .eq('assigned_by', senderId)
      .eq('assigned_to', recipientId)
      .or(messageId ? `description.ilike.%message_id:${messageId}%,description.ilike.%${message.substring(0, 50).replace(/[%_]/g, '')}%` : `description.ilike.%${message.substring(0, 50).replace(/[%_]/g, '')}%`)

    console.log('[Chat Analyze API] Task lookup result:', { existingTasksById, messageId, messagePreview: message.substring(0, 50) })

    if (existingTasksById && existingTasksById.length > 0) {
      console.log('[Chat Analyze API] Already processed this message (task exists):', existingTasksById[0])
      return NextResponse.json({ isActionable: false, alreadyProcessed: true })
    }

    // Check for existing email draft with the same message (any status)
    const { data: existingDrafts, error: draftError } = await getSupabaseAdmin()
      .from('email_drafts')
      .select('id, status')
      .eq('user_id', recipientId)
      .eq('commitment_quote', message)

    console.log('[Chat Analyze API] Draft lookup result:', { existingDrafts, draftError, messagePreview: message.substring(0, 50) })

    if (existingDrafts && existingDrafts.length > 0) {
      console.log('[Chat Analyze API] Already processed this message (draft exists):', existingDrafts[0])
      return NextResponse.json({ isActionable: false, alreadyProcessed: true })
    }

    const now = new Date()

    // Use GPT to analyze if this is an actionable request
    const openai = getOpenAI()
    if (!openai) {
      return NextResponse.json({ isActionable: false, error: 'OpenAI not configured' })
    }

    const analysisResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You analyze chat messages to determine if they contain actionable task requests from a colleague.

A message is actionable if:
- It asks someone to DO something specific (call, send, review, check, follow up, etc.)
- It's a work-related request, not casual conversation
- It requires action from the recipient

NOT actionable:
- "Can you believe this weather?" (rhetorical)
- "Please let me know your thoughts" (vague/optional)
- "Will you be at the meeting?" (question, not request)
- General pleasantries or questions

SPECIAL: EMAIL REQUESTS
If the message asks someone to EMAIL or SEND a document/file/info to them (the sender), this is an EMAIL REQUEST.
Examples of email requests:
- "Can you email me the investment guide?"
- "Please send me the brochure"
- "Would you mind sending over the pricing sheet?"
- "Can you send me that document we discussed?"
- "Can you send me your headshot?"
- "Send over your photo for the website"

For email requests, extract:
- document_hints: keywords describing what document(s) they want. Be LIBERAL in extracting hints:
  - "headshot" -> ["headshot", "photo", "picture", "portrait"]
  - "pricing" -> ["pricing", "price", "rates", "cost"]
  - "brochure" -> ["brochure", "guide", "info"]
  - Include synonyms and related terms to maximize match chances
- subject_hint: a brief subject line hint

IMPORTANT for task titles:
- Always include WHO the action is for in the title
- If a specific person is mentioned (e.g., "send it to Kelly"), use their name
- If no one else is mentioned, the action is for the sender, so include their name

Current time: ${now.toISOString()}

Respond in JSON format only.`,
        },
        {
          role: 'user',
          content: `Analyze this message from ${senderName || 'a colleague'}:

"${message}"

If actionable, extract the task. The task title MUST include who it's for (either "${senderName}" if they're the recipient, or the person mentioned in the message).

Respond with:
{
  "isActionable": boolean,
  "isEmailRequest": boolean (true if they're asking to be emailed something),
  "emailDraft": {
    "should_draft": boolean,
    "document_hints": ["keyword1", "keyword2"],
    "subject_hint": "Brief subject line"
  },
  "task": {
    "title": "Brief task title including recipient name (under 60 chars)",
    "description": "What was requested and any context",
    "priority": 1-5 (1=urgent, 5=low),
    "due_days": number of days until due (default 1 if not specified),
    "due_datetime": "ISO datetime if specific time mentioned, otherwise null"
  }
}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 400,
    })

    const content = analysisResponse.choices[0]?.message?.content
    console.log('[Chat Analyze API] OpenAI response:', content)

    if (!content) {
      console.log('[Chat Analyze API] No content from OpenAI')
      return NextResponse.json({ isActionable: false })
    }

    const analysis: AnalysisResult = JSON.parse(content)
    console.log('[Chat Analyze API] Parsed analysis:', analysis)

    // Handle email request - draft an email to the coworker
    if (analysis.isEmailRequest && analysis.emailDraft?.should_draft) {
      console.log(`[Chat Analyze API] Email request detected, creating draft for user_id: ${recipientId}`)

      try {
        // Get sender's email from users table
        const { data: senderUser } = await getSupabaseAdmin()
          .from('users')
          .select('id, email, first_name, last_name')
          .eq('id', senderId)
          .single()

        if (senderUser?.email) {
          // Get recipient's (current user) info
          const { data: recipientUser } = await getSupabaseAdmin()
            .from('users')
            .select('id, first_name, last_name')
            .eq('id', recipientId)
            .single()

          const recipientFirstName = recipientUser?.first_name || 'there'

          // Match documents using document hints
          let matchedDocuments: { id: string; file_name: string }[] = []
          if (analysis.emailDraft.document_hints.length > 0) {
            // Fetch user's documents
            const { data: userDocs } = await getSupabaseAdmin()
              .from('documents')
              .select('id, file_name, description')
              .eq('uploaded_by', recipientId)
              .eq('is_deleted', false)
              .limit(50)

            if (userDocs && userDocs.length > 0) {
              // Use AI to match documents
              const matchResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: `You are an intelligent document matcher. Your job is to find documents that match what someone is looking for.

MATCHING RULES:
1. Match by filename - if the keyword appears in the filename, it's a match
   - "headshot" matches "my-headshot.png", "headshot-2024.jpg", etc.
   - "pricing" matches "pricing-sheet.pdf", "gold-pricing.xlsx"
2. Match by content type - understand what they're asking for
   - "photo", "picture", "image" might match .png, .jpg files
   - "document" might match .pdf, .docx files
3. Match by description/tags if available
4. Be GENEROUS in matching - it's better to attach a relevant document than miss it

Return JSON only.`,
                  },
                  {
                    role: 'user',
                    content: `The user is looking for: ${analysis.emailDraft.document_hints.join(', ')}

Available documents:
${userDocs.map(d => `- ID: ${d.id}, Name: "${d.file_name}"${d.description ? `, Description: ${d.description}` : ''}`).join('\n')}

Find ALL documents that could match what they're looking for. A document matches if:
- Any search keyword appears in the filename (e.g., "headshot" matches "my-headshot.png")
- The file type is appropriate (e.g., .png/.jpg for photo requests)
- The description mentions relevant terms

Return the IDs of matching documents (max 3):
{ "matched_ids": ["id1", "id2"], "match_reasons": ["filename contains 'headshot'", "..."] }

If absolutely no matches found, return { "matched_ids": [], "match_reasons": [] }`,
                  },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 200,
              })

              const matchResult = JSON.parse(matchResponse.choices[0]?.message?.content || '{"matched_ids":[]}')
              console.log('[Chat Analyze API] AI document match result:', matchResult)

              if (matchResult.matched_ids?.length > 0) {
                matchedDocuments = userDocs
                  .filter(d => matchResult.matched_ids.includes(d.id))
                  .map(d => ({ id: d.id, file_name: d.file_name }))
              }

              // Fallback: if AI found nothing, do simple filename keyword matching
              if (matchedDocuments.length === 0 && analysis.emailDraft.document_hints.length > 0) {
                console.log('[Chat Analyze API] AI found no matches, trying simple keyword match...')
                const hints = analysis.emailDraft.document_hints.map(h => h.toLowerCase())

                for (const doc of userDocs) {
                  const fileNameLower = doc.file_name.toLowerCase()
                  const descLower = (doc.description || '').toLowerCase()

                  for (const hint of hints) {
                    // Check if any hint word appears in filename or description
                    const hintWords = hint.split(/\s+/)
                    for (const word of hintWords) {
                      if (word.length >= 3 && (fileNameLower.includes(word) || descLower.includes(word))) {
                        matchedDocuments.push({ id: doc.id, file_name: doc.file_name })
                        console.log(`[Chat Analyze API] Keyword match found: "${word}" in "${doc.file_name}"`)
                        break
                      }
                    }
                    if (matchedDocuments.find(m => m.id === doc.id)) break
                  }

                  if (matchedDocuments.length >= 3) break
                }
              }
            }
          }

          // Generate email body
          const documentNames = matchedDocuments.map(d => d.file_name).join(', ')
          const emailResponse = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You write professional but warm emails. These are standalone emails (NOT chat replies).

Format:
- Start with "Hi [Name],"
- Keep it to 2-3 short sentences
- Be helpful and friendly, not stiff or formal
- End with something like "Let me know if you need anything else!" or "Happy to help with anything else!"
- Sign off warmly

Example tone:
"Hi Kyle,

Here's the investment guide you asked for - I've attached it to this email.

Let me know if you have any questions or need anything else!

Best,
[Name]"`,
              },
              {
                role: 'user',
                content: `Write an email from ${recipientFirstName} to ${senderName}.

Context: ${senderName} asked for: "${message}"

${matchedDocuments.length > 0
  ? `Attached documents: ${documentNames}`
  : 'No documents attached, but acknowledge you received their request and will help.'}

Return JSON only:
{
  "subject": "Short subject (e.g., '${documentNames || 'Your request'}' - no 'Re:' prefix)",
  "body_html": "<p>Hi ${senderName},</p><p>Body paragraph...</p><p>Closing line!</p><p>Best,<br>${recipientFirstName}</p>"
}`,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 400,
          })

          const emailContent = JSON.parse(emailResponse.choices[0]?.message?.content || '{}')

          // First create the task so we can link it to the draft
          let taskId: string | undefined
          let taskTitle: string | undefined
          if (analysis.task) {
            const dueDate = new Date()
            dueDate.setDate(dueDate.getDate() + (analysis.task.due_days || 1))

            // Build a descriptive task title with proper fallback
            const hintsDescription = analysis.emailDraft.document_hints.length > 0
              ? analysis.emailDraft.document_hints.join(', ')
              : matchedDocuments.length > 0
                ? matchedDocuments.map(d => d.file_name).join(', ')
                : 'requested info'
            taskTitle = `Email ${senderName}: ${hintsDescription}`
            const taskDescription = `${analysis.task.description}\n\nAI Draft created - review and send the email.\n\n— Requested by ${senderName || 'colleague'} via chat${messageId ? `\n[message_id:${messageId}]` : ''}`

            const { data: task, error: taskError } = await getSupabaseAdmin()
              .from('tasks')
              .insert({
                title: taskTitle,
                description: taskDescription,
                assigned_to: recipientId,
                assigned_by: senderId,
                due_at: dueDate.toISOString(),
                priority: analysis.task.priority || 3,
                task_type: 'follow_up',
                source: 'chat_request',
                status: 'pending',
              })
              .select('id')
              .single()

            if (!taskError && task) {
              taskId = task.id
              console.log('[Chat Analyze API] Task created:', taskId)
            }
          }

          // Create the email draft with linked task
          const draftData: Record<string, unknown> = {
            user_id: recipientId,
            to_email: senderUser.email,
            to_name: senderName,
            subject: emailContent.subject || analysis.emailDraft.subject_hint || `Re: ${analysis.emailDraft.document_hints.join(', ')}`,
            body_html: emailContent.body_html || `<p>Hi ${senderName},</p><p>Here's what you requested!</p>`,
            attachment_ids: matchedDocuments.map(d => d.id),
            status: 'pending',
            ai_generated: true,
            commitment_quote: message,
          }

          // Link to task if created
          if (taskId) {
            draftData.task_id = taskId
          }

          console.log('[Chat Analyze API] Inserting draft with data:', JSON.stringify(draftData, null, 2))

          const { data: draft, error: draftError } = await getSupabaseAdmin()
            .from('email_drafts')
            .insert(draftData)
            .select('id')
            .single()

          if (draftError) {
            console.error('[Chat Analyze API] Failed to create email draft:', draftError)
          } else {
            console.log('[Chat Analyze API] Email draft created:', draft?.id)

            // Return success with both draft and task info
            return NextResponse.json({
              isActionable: true,
              isEmailRequest: true,
              emailDraftCreated: true,
              draftId: draft?.id,
              attachedDocuments: matchedDocuments.map(d => d.file_name),
              taskCreated: !!taskId,
              taskId,
              taskTitle,
            })
          }
        }
      } catch (emailError) {
        console.error('[Chat Analyze API] Email draft creation failed:', emailError)
        // Fall through to create task instead
      }
    }

    // If actionable (and not an email request that was already handled), create the task
    if (analysis.isActionable && analysis.task && !analysis.isEmailRequest) {
      let dueDate: Date

      if (analysis.task.due_datetime) {
        const parsedDate = new Date(analysis.task.due_datetime)
        if (!isNaN(parsedDate.getTime()) && parsedDate > now) {
          dueDate = parsedDate
        } else {
          dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + (analysis.task.due_days || 1))
        }
      } else {
        dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + (analysis.task.due_days || 1))
      }

      // Include message_id in description to prevent duplicates
      const description = `${analysis.task.description}\n\n— Requested by ${senderName || 'colleague'} via chat${messageId ? `\n[message_id:${messageId}]` : ''}`

      const { data: task, error } = await getSupabaseAdmin()
        .from('tasks')
        .insert({
          title: analysis.task.title,
          description,
          assigned_to: recipientId,
          assigned_by: senderId,
          due_at: dueDate.toISOString(),
          priority: analysis.task.priority || 3,
          task_type: 'follow_up',
          source: 'chat_request',
          status: 'pending',
        })
        .select('id')
        .single()

      if (error) {
        console.error('Failed to create task:', error)
        return NextResponse.json({ isActionable: false, error: 'Failed to create task' })
      }

      return NextResponse.json({
        isActionable: true,
        taskCreated: true,
        taskId: task?.id,
        taskTitle: analysis.task.title,
      })
    }

    return NextResponse.json({ isActionable: false })
  } catch (error) {
    console.error('Chat analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    )
  } finally {
    // Always release the lock
    if (messageIdToUnlock) {
      processingMessages.delete(messageIdToUnlock)
      console.log('[Chat Analyze API] Released lock for message:', messageIdToUnlock)
    }
  }
}
