import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// Lazy initialization to avoid errors when env vars are missing at build time
let openaiInstance: OpenAI | null = null
let supabaseAdminInstance: ReturnType<typeof createClient> | null = null

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

function getSupabaseAdmin() {
  if (!supabaseAdminInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      supabaseAdminInstance = createClient(url, key)
    }
  }
  return supabaseAdminInstance
}

export interface EmailAIAnalysis {
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
  sentiment_score: number // -1 to 1
  intent: string // inquiry, follow_up, complaint, urgent, informational, commitment, request
  urgency_score: number // 0-100
  action_items: string[]
  key_topics: string[]
  commitments: Array<{
    who: 'sender' | 'recipient'
    what: string
    when: string | null
    parsed_due_at: string | null
  }>
  requests: Array<{
    from: 'sender' | 'recipient'
    to: 'sender' | 'recipient'
    what: string
    urgency: 'low' | 'medium' | 'high' | 'urgent'
    parsed_due_at: string | null
  }>
}

export interface TaskFromEmail {
  title: string
  description: string
  due_at: string | null
  priority: number // 1-5
  task_type: string
}

/**
 * Parse time references like "EOD", "tomorrow", "by Friday" into actual dates
 */
function parseTimeReference(timeRef: string | null, userTimezone: string = 'America/Los_Angeles'): string | null {
  if (!timeRef) return null

  const now = new Date()
  const lowerRef = timeRef.toLowerCase().trim()

  // End of day (5pm local time)
  if (lowerRef.includes('eod') || lowerRef.includes('end of day') || lowerRef.includes('end of the day') || lowerRef.includes('today')) {
    const eod = new Date(now)
    eod.setHours(17, 0, 0, 0) // 5pm
    return eod.toISOString()
  }

  // Tomorrow
  if (lowerRef.includes('tomorrow')) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (lowerRef.includes('morning')) {
      tomorrow.setHours(9, 0, 0, 0)
    } else if (lowerRef.includes('eod') || lowerRef.includes('end of day')) {
      tomorrow.setHours(17, 0, 0, 0)
    } else {
      tomorrow.setHours(17, 0, 0, 0) // Default to EOD tomorrow
    }
    return tomorrow.toISOString()
  }

  // End of week
  if (lowerRef.includes('end of week') || lowerRef.includes('eow')) {
    const friday = new Date(now)
    const daysUntilFriday = (5 - friday.getDay() + 7) % 7 || 7
    friday.setDate(friday.getDate() + daysUntilFriday)
    friday.setHours(17, 0, 0, 0)
    return friday.toISOString()
  }

  // Day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 0; i < days.length; i++) {
    if (lowerRef.includes(days[i])) {
      const targetDay = new Date(now)
      const currentDay = targetDay.getDay()
      const daysUntil = (i - currentDay + 7) % 7 || 7
      targetDay.setDate(targetDay.getDate() + daysUntil)
      targetDay.setHours(17, 0, 0, 0)
      return targetDay.toISOString()
    }
  }

  // ASAP / urgent
  if (lowerRef.includes('asap') || lowerRef.includes('urgent') || lowerRef.includes('immediately')) {
    const urgent = new Date(now)
    urgent.setHours(urgent.getHours() + 2) // 2 hours from now
    return urgent.toISOString()
  }

  // Try to parse as a date
  try {
    const parsed = new Date(timeRef)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  } catch {
    // Not a valid date
  }

  return null
}

/**
 * Analyze an email using OpenAI to extract actionable items, commitments, and requests
 */
export async function analyzeEmail(
  emailId: string,
  fromAddress: string,
  fromName: string | null,
  toAddresses: string[],
  subject: string | null,
  bodyText: string | null,
  bodyHtml: string | null,
  isInbound: boolean,
  userTimezone: string = 'America/Los_Angeles'
): Promise<EmailAIAnalysis | null> {
  // Use plain text or strip HTML
  const content = bodyText || stripHtmlBasic(bodyHtml || '')
  if (!content || content.trim().length < 10) {
    return null
  }

  const prompt = `Analyze this email and extract actionable information.

EMAIL METADATA:
- From: ${fromName ? `${fromName} <${fromAddress}>` : fromAddress}
- To: ${toAddresses.join(', ')}
- Subject: ${subject || '(no subject)'}
- Direction: ${isInbound ? 'INBOUND (received by CRM user)' : 'OUTBOUND (sent by CRM user)'}

EMAIL CONTENT:
${content.substring(0, 4000)}

Analyze this email and respond with a JSON object containing:

1. "summary": A 1-2 sentence summary of the email's main point
2. "sentiment": One of "positive", "neutral", or "negative"
3. "sentiment_score": A number from -1 (very negative) to 1 (very positive)
4. "intent": The primary intent - one of: "inquiry", "follow_up", "complaint", "urgent", "informational", "commitment", "request", "greeting", "scheduling", "negotiation"
5. "urgency_score": 0-100 score indicating how urgent this email is (100 = extremely urgent)
6. "action_items": Array of specific action items mentioned in the email
7. "key_topics": Array of main topics discussed (max 5)
8. "commitments": Array of commitments/promises made, each with:
   - "who": "sender" or "recipient" (who made the commitment)
   - "what": What they committed to
   - "when": The timeframe mentioned (e.g., "EOD today", "by Friday", "tomorrow", null if not specified)
   - "parsed_due_at": null (will be filled in by system)
9. "requests": Array of requests made, each with:
   - "from": "sender" or "recipient" (who is making the request)
   - "to": "sender" or "recipient" (who should fulfill it)
   - "what": What is being requested
   - "urgency": "low", "medium", "high", or "urgent"
   - "parsed_due_at": null (will be filled in by system)

Focus on identifying actionable items that should become tasks. Pay special attention to:
- Deadlines mentioned (EOD, by Friday, tomorrow, etc.)
- Promises to send documents, information, or follow up
- Requests for the recipient to do something
- Meeting requests or scheduling needs

Respond ONLY with the JSON object, no markdown formatting.`

  try {
    const openai = getOpenAI()
    if (!openai) {
      console.log('OpenAI API key not configured, skipping email analysis')
      return null
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert email analyzer for a CRM system. Your job is to extract actionable information, commitments, and requests from emails. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    })

    const responseText = response.choices[0]?.message?.content?.trim()
    if (!responseText) {
      console.error('Empty response from OpenAI for email analysis')
      return null
    }

    // Parse JSON (handle potential markdown code blocks)
    let jsonStr = responseText
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const analysis = JSON.parse(jsonStr) as EmailAIAnalysis

    // Parse time references in commitments
    if (analysis.commitments) {
      analysis.commitments = analysis.commitments.map(c => ({
        ...c,
        parsed_due_at: parseTimeReference(c.when, userTimezone)
      }))
    }

    // Parse time references in requests
    if (analysis.requests) {
      analysis.requests = analysis.requests.map(r => ({
        ...r,
        parsed_due_at: parseTimeReference(
          r.urgency === 'urgent' ? 'ASAP' : null,
          userTimezone
        )
      }))
    }

    return analysis
  } catch (error) {
    console.error('Error analyzing email with OpenAI:', error)
    return null
  }
}

/**
 * Generate tasks from email analysis
 */
export function generateTasksFromAnalysis(
  analysis: EmailAIAnalysis,
  isInbound: boolean,
  fromAddress: string,
  subject: string | null
): TaskFromEmail[] {
  const tasks: TaskFromEmail[] = []

  // Create tasks from commitments (what we promised to do)
  for (const commitment of analysis.commitments || []) {
    // For inbound emails, "recipient" commitments are things WE need to do
    // For outbound emails, "sender" commitments are things WE need to do
    const isOurCommitment = isInbound
      ? commitment.who === 'recipient'
      : commitment.who === 'sender'

    if (isOurCommitment && commitment.what) {
      tasks.push({
        title: commitment.what.length > 100
          ? commitment.what.substring(0, 97) + '...'
          : commitment.what,
        description: `Commitment from email: "${subject || '(no subject)'}"\n\nOriginal commitment: ${commitment.what}\nTimeframe: ${commitment.when || 'Not specified'}`,
        due_at: commitment.parsed_due_at,
        priority: commitment.parsed_due_at ? 4 : 3, // Higher priority if there's a deadline
        task_type: 'follow_up'
      })
    }
  }

  // Create tasks from requests (things others asked us to do)
  for (const request of analysis.requests || []) {
    // For inbound emails, requests TO "recipient" are for US
    // For outbound emails, requests TO "sender" are for US
    const isRequestForUs = isInbound
      ? request.to === 'recipient'
      : request.to === 'sender'

    if (isRequestForUs && request.what) {
      const priorityMap: Record<string, number> = {
        'urgent': 5,
        'high': 4,
        'medium': 3,
        'low': 2
      }

      tasks.push({
        title: request.what.length > 100
          ? request.what.substring(0, 97) + '...'
          : request.what,
        description: `Request from ${fromAddress} in email: "${subject || '(no subject)'}"\n\nRequest: ${request.what}\nUrgency: ${request.urgency}`,
        due_at: request.parsed_due_at,
        priority: priorityMap[request.urgency] || 3,
        task_type: 'follow_up'
      })
    }
  }

  // If high urgency but no specific tasks, create a general follow-up task
  if (tasks.length === 0 && analysis.urgency_score >= 70) {
    tasks.push({
      title: `Urgent: Respond to "${subject || 'email'}"`,
      description: `High urgency email from ${fromAddress}\n\nSummary: ${analysis.summary}\n\nKey topics: ${analysis.key_topics?.join(', ') || 'N/A'}`,
      due_at: parseTimeReference('today'),
      priority: 4,
      task_type: 'follow_up'
    })
  }

  return tasks
}

/**
 * Basic HTML stripping (for when email-utils isn't available)
 */
function stripHtmlBasic(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Find lead/contact by email address
 */
export async function findLeadOrContactByEmail(email: string): Promise<{
  lead_id: string | null
  contact_id: string | null
  lead_name: string | null
  contact_name: string | null
}> {
  const normalizedEmail = email.toLowerCase().trim()

  // Search leads first
  const { data: lead } = await getSupabaseAdmin()
    .from('leads')
    .select('id, first_name, last_name')
    .ilike('email', normalizedEmail)
    .eq('is_deleted', false)
    .limit(1)
    .single()

  if (lead) {
    return {
      lead_id: lead.id,
      contact_id: null,
      lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null,
      contact_name: null
    }
  }

  // Search contacts
  const { data: contact } = await getSupabaseAdmin()
    .from('contacts')
    .select('id, first_name, last_name')
    .ilike('email', normalizedEmail)
    .eq('is_deleted', false)
    .limit(1)
    .single()

  if (contact) {
    return {
      lead_id: null,
      contact_id: contact.id,
      lead_name: null,
      contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || null
    }
  }

  return {
    lead_id: null,
    contact_id: null,
    lead_name: null,
    contact_name: null
  }
}

/**
 * Normalize phone number by removing all non-digit characters
 */
function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Find lead by phone number
 * Searches both phone and phone_secondary fields
 */
export async function findLeadByPhone(phoneNumber: string): Promise<{
  lead_id: string | null
  lead_name: string | null
  lead_email: string | null
}> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber)

  if (!normalizedPhone || normalizedPhone.length < 10) {
    return { lead_id: null, lead_name: null, lead_email: null }
  }

  // Try exact match first (with or without country code)
  const phoneVariants = [
    normalizedPhone,
    normalizedPhone.slice(-10), // Last 10 digits (without country code)
    `1${normalizedPhone.slice(-10)}`, // With US country code
  ]

  // Search leads by phone or phone_secondary
  for (const variant of phoneVariants) {
    // Check primary phone
    const { data: leadByPhone } = await getSupabaseAdmin()
      .from('leads')
      .select('id, first_name, last_name, email')
      .or(`phone.ilike.%${variant}%,phone_secondary.ilike.%${variant}%`)
      .eq('is_deleted', false)
      .limit(1)
      .single()

    if (leadByPhone) {
      return {
        lead_id: leadByPhone.id,
        lead_name: `${leadByPhone.first_name || ''} ${leadByPhone.last_name || ''}`.trim() || null,
        lead_email: leadByPhone.email || null
      }
    }
  }

  return { lead_id: null, lead_name: null, lead_email: null }
}

/**
 * Create activity log entry for email
 */
export async function createEmailActivityLog(
  emailId: string,
  isInbound: boolean,
  userId: string | null,
  leadId: string | null,
  contactId: string | null,
  dealId: string | null,
  subject: string | null,
  fromAddress: string
): Promise<void> {
  const eventType = isInbound ? 'email_received' : 'email_sent'
  const description = isInbound
    ? `Email received from ${fromAddress}: "${subject || '(no subject)'}"`
    : `Email sent: "${subject || '(no subject)'}"`

  await getSupabaseAdmin()?.from('activity_log').insert({
    event_type: eventType,
    event_description: description,
    user_id: userId,
    entity_type: 'email',
    entity_id: emailId,
    email_id: emailId,
    lead_id: leadId,
    contact_id: contactId,
    deal_id: dealId,
    metadata: {
      subject,
      from_address: fromAddress,
      is_inbound: isInbound
    }
  })
}

/**
 * Create tasks from email analysis
 */
export async function createTasksFromEmail(
  tasks: TaskFromEmail[],
  emailId: string,
  assignedTo: string,
  leadId: string | null,
  contactId: string | null,
  dealId: string | null
): Promise<string[]> {
  const createdTaskIds: string[] = []

  for (const task of tasks) {
    const { data, error } = await getSupabaseAdmin()
      .from('tasks')
      .insert({
        title: task.title,
        description: task.description,
        assigned_to: assignedTo,
        email_id: emailId,
        lead_id: leadId,
        contact_id: contactId,
        deal_id: dealId,
        due_at: task.due_at,
        priority: task.priority,
        task_type: task.task_type,
        source: 'ai_email_analysis',
        status: 'pending'
      })
      .select('id')
      .single()

    if (data && !error) {
      createdTaskIds.push(data.id)

      // Log task creation
      await getSupabaseAdmin()?.from('activity_log').insert({
        event_type: 'task_created',
        event_description: `AI-generated task from email: ${task.title}`,
        user_id: assignedTo,
        entity_type: 'task',
        entity_id: data.id,
        email_id: emailId,
        lead_id: leadId,
        contact_id: contactId,
        deal_id: dealId,
        metadata: {
          source: 'ai_email_analysis',
          task_title: task.title,
          due_at: task.due_at
        }
      })
    } else if (error) {
      console.error('Error creating task from email:', error)
    }
  }

  return createdTaskIds
}

/**
 * Update email with AI analysis results
 */
export async function updateEmailWithAnalysis(
  emailId: string,
  analysis: EmailAIAnalysis,
  tasksGenerated: boolean
): Promise<void> {
  await getSupabaseAdmin()
    .from('emails')
    .update({
      ai_analysis_status: 'completed',
      ai_analyzed_at: new Date().toISOString(),
      ai_tasks_generated: tasksGenerated,
      ai_processed_at: new Date().toISOString(),
      ai_summary: analysis.summary,
      ai_sentiment: analysis.sentiment,
      ai_sentiment_score: analysis.sentiment_score,
      ai_intent: analysis.intent,
      ai_urgency_score: analysis.urgency_score,
      ai_action_items: analysis.action_items,
      ai_key_topics: analysis.key_topics,
      ai_commitments: analysis.commitments,
      ai_requests: analysis.requests,
      ai_raw_response: analysis
    })
    .eq('id', emailId)
}

/**
 * Link email to lead/contact
 */
export async function linkEmailToLeadOrContact(
  emailId: string,
  leadId: string | null,
  contactId: string | null,
  linkType: 'from' | 'to' | 'cc' | 'bcc' = 'from'
): Promise<void> {
  if (!leadId && !contactId) return

  // Update the email record
  await getSupabaseAdmin()
    .from('emails')
    .update({
      lead_id: leadId,
      contact_id: contactId
    })
    .eq('id', emailId)

  // Also update the thread
  const { data: email } = await getSupabaseAdmin()
    .from('emails')
    .select('thread_id')
    .eq('id', emailId)
    .single()

  if (email?.thread_id) {
    await getSupabaseAdmin()
      .from('email_threads')
      .update({
        lead_id: leadId,
        contact_id: contactId
      })
      .eq('id', email.thread_id)
  }

  // Create link record for many-to-many tracking
  await getSupabaseAdmin()
    .from('email_lead_links')
    .upsert({
      email_id: emailId,
      lead_id: leadId,
      contact_id: contactId,
      link_type: linkType,
      auto_linked: true
    }, {
      onConflict: leadId ? 'email_id,lead_id,link_type' : 'email_id,contact_id,link_type'
    })
}

/**
 * Process an email for AI analysis and task generation
 * This is the main entry point called from webhooks/API routes
 */
export async function processEmailForAI(
  emailId: string,
  fromAddress: string,
  fromName: string | null,
  toAddresses: string[],
  subject: string | null,
  bodyText: string | null,
  bodyHtml: string | null,
  isInbound: boolean,
  accountUserId: string
): Promise<{
  analysis: EmailAIAnalysis | null
  tasksCreated: string[]
  linkedLead: string | null
  linkedContact: string | null
}> {
  // 1. Find lead/contact by email
  const senderMatch = await findLeadOrContactByEmail(fromAddress)
  let linkedLead = senderMatch.lead_id
  let linkedContact = senderMatch.contact_id

  // Also check recipients for inbound emails
  if (!linkedLead && !linkedContact && !isInbound) {
    for (const toAddr of toAddresses) {
      const recipientMatch = await findLeadOrContactByEmail(toAddr)
      if (recipientMatch.lead_id || recipientMatch.contact_id) {
        linkedLead = recipientMatch.lead_id
        linkedContact = recipientMatch.contact_id
        break
      }
    }
  }

  // 2. Link email to lead/contact
  if (linkedLead || linkedContact) {
    await linkEmailToLeadOrContact(emailId, linkedLead, linkedContact, isInbound ? 'from' : 'to')
  }

  // 3. Create activity log entry
  await createEmailActivityLog(
    emailId,
    isInbound,
    accountUserId,
    linkedLead,
    linkedContact,
    null, // dealId - could be enhanced to find related deals
    subject,
    fromAddress
  )

  // 4. Run AI analysis
  const analysis = await analyzeEmail(
    emailId,
    fromAddress,
    fromName,
    toAddresses,
    subject,
    bodyText,
    bodyHtml,
    isInbound
  )

  let tasksCreated: string[] = []

  if (analysis) {
    // 5. Generate and create tasks
    const tasks = generateTasksFromAnalysis(analysis, isInbound, fromAddress, subject)

    if (tasks.length > 0) {
      tasksCreated = await createTasksFromEmail(
        tasks,
        emailId,
        accountUserId,
        linkedLead,
        linkedContact,
        null // dealId
      )
    }

    // 6. Update email with analysis results
    await updateEmailWithAnalysis(emailId, analysis, tasksCreated.length > 0)
  }

  return {
    analysis,
    tasksCreated,
    linkedLead,
    linkedContact
  }
}
