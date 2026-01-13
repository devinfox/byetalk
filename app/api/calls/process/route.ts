import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { AssemblyAI } from 'assemblyai'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { findLeadByPhone } from '@/lib/email-ai'
import { findMatchingFunnelSemantic } from '@/lib/funnel-matcher'

/**
 * Get or create the AI Generated system import group for an organization
 */
async function getAIGeneratedGroup(organizationId: string): Promise<string | null> {
  if (!organizationId) return null

  const admin = getSupabaseAdmin()

  // Check if group exists
  const { data: existingGroup } = await admin
    .from('lead_import_jobs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_system', true)
    .eq('file_name', 'ai-generated')
    .single()

  if (existingGroup) {
    return existingGroup.id
  }

  // Create the group
  const { data: newGroup, error } = await admin
    .from('lead_import_jobs')
    .insert({
      file_name: 'ai-generated',
      display_name: 'AI Generated',
      organization_id: organizationId,
      is_system: true,
      status: 'completed',
      field_mapping: {},
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Calls Process] Error creating AI Generated group:', error)
    return null
  }

  return newGroup.id
}

// OpenAI for all AI analysis (summary, sentiment, tasks, etc.)
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

// AssemblyAI ONLY for speaker diarization (identifying who said what)
const assemblyai = process.env.ASSEMBLYAI_API_KEY
  ? new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY })
  : null

interface DiarizedUtterance {
  speaker: string // 'A' or 'B'
  text: string
  start: number
  end: number
}

interface ActionItem {
  title: string
  description: string
  priority: number
  task_type: string
  due_days: number
  due_datetime?: string
  scheduled_time_display?: string
}

interface EmailDraftRequest {
  should_draft: boolean
  content_hints: string[]
  tone_from_call: string
  due_datetime: string | null
  commitment_quote: string
}

interface ExtractedLeadInfo {
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
  occupation: string | null
  city: string | null
  state: string | null
  notes: string | null
}

interface FunnelEnrollment {
  should_enroll: boolean
  reasoning: string
  suggested_tags: string[]
  urgency: 'immediate' | 'within_24h' | 'within_week' | 'not_urgent'
}

// Process a call recording: transcribe, analyze, and generate tasks
export async function POST(request: NextRequest) {
  let callId: string | undefined

  try {
    const body = await request.json()
    callId = body.callId

    if (!callId) {
      return NextResponse.json({ error: 'Call ID required' }, { status: 400 })
    }

    // Get the call record
    const { data: call, error: callError } = await getSupabaseAdmin()
      .from('calls')
      .select('*, contact:contacts(first_name, last_name), user:users!calls_user_id_fkey(id, first_name, last_name)')
      .eq('id', callId)
      .single()

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    // Check if already processed
    if (call.ai_tasks_generated) {
      return NextResponse.json({ message: 'Call already processed' })
    }

    // Determine the owner (employee who handled the call)
    // For inbound calls, this is the person who answered
    // For outbound calls, this is the person who made the call
    let ownerId = call.user_id
    let organizationId: string | null = null

    // If no user_id on call, try to find an active user as fallback
    if (!ownerId) {
      console.log('⚠️ No user_id on call record, attempting to find fallback owner...')
      const { data: activeUsers } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .limit(1)
        .single()

      if (activeUsers) {
        ownerId = activeUsers.id
        organizationId = activeUsers.organization_id
        console.log('Using fallback owner:', ownerId)

        // Update the call record with the owner
        await getSupabaseAdmin()
          .from('calls')
          .update({ user_id: ownerId })
          .eq('id', callId)
      }
    } else {
      // Get the owner's organization
      const { data: ownerData } = await getSupabaseAdmin()
        .from('users')
        .select('organization_id')
        .eq('id', ownerId)
        .single()

      if (ownerData) {
        organizationId = ownerData.organization_id
      }
    }

    console.log('Processing call:', {
      callId,
      direction: call.direction,
      user_id: call.user_id,
      ownerId,
      lead_id: call.lead_id,
      hasRecording: !!call.recording_url,
    })

    let transcription = call.transcription
    let diarizedTranscript: DiarizedUtterance[] | null = null

    // Step 1: Get transcription with speaker diarization
    if (call.recording_url && !transcription) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID
        const authToken = process.env.TWILIO_AUTH_TOKEN

        // Build recording URL
        const recordingUrl = call.recording_url.endsWith('.mp3')
          ? call.recording_url
          : `${call.recording_url}.mp3`

        // Download the recording first (Twilio requires auth)
        console.log('Downloading recording from Twilio...')
        const audioResponse = await fetch(recordingUrl, {
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          },
        })

        if (!audioResponse.ok) {
          throw new Error(`Failed to fetch recording: ${audioResponse.status} ${audioResponse.statusText}`)
        }

        const audioBuffer = await audioResponse.arrayBuffer()
        console.log(`Downloaded ${Math.round(audioBuffer.byteLength / 1024)} KB audio`)

        // Use AssemblyAI for dual-channel transcription
        // Channel mapping depends on call direction AND call type:
        // - OUTBOUND (normal): Channel 1 = Employee (dialed out), Channel 2 = Lead
        // - INBOUND: Channel 1 = Lead (dialed in), Channel 2 = Employee (answered)
        // - TURBO MODE (conference): Channel 1 = Lead (bridged in), Channel 2 = Employee (in conference)
        //   Note: Turbo mode calls are marked as "outbound" but have INVERTED channels because
        //   the lead is being bridged INTO the rep's existing conference
        if (assemblyai) {
          const isTurboMode = (call.phone_system_metadata as Record<string, unknown>)?.turbo_mode === true
          const isInbound = call.direction === 'inbound'
          // For turbo mode, channels are inverted (lead is Ch1, employee is Ch2)
          const useInvertedChannels = isInbound || isTurboMode
          console.log(`Using AssemblyAI for dual-channel transcription (${isTurboMode ? 'TURBO MODE' : isInbound ? 'INBOUND' : 'OUTBOUND'}: Ch1=${useInvertedChannels ? 'Lead' : 'Employee'}, Ch2=${useInvertedChannels ? 'Employee' : 'Lead'})...`)

          // Upload audio to AssemblyAI first
          const uploadUrl = await assemblyai.files.upload(Buffer.from(audioBuffer))
          console.log('Uploaded to AssemblyAI, transcribing...')

          const transcript = await assemblyai.transcripts.transcribe({
            audio_url: uploadUrl,
            multichannel: true,
          })

          if (transcript.status === 'completed' && transcript.utterances) {
            // Extract channel-labeled utterances
            // Channel mapping depends on call type (see above)
            // Note: channel can be string or number depending on AssemblyAI response
            diarizedTranscript = transcript.utterances.map((u) => {
              const isChannel1 = String(u.channel) === '1'
              // For OUTBOUND (normal): Channel 1 = Employee, Channel 2 = Lead
              // For INBOUND or TURBO MODE: Channel 1 = Lead, Channel 2 = Employee
              const speaker = useInvertedChannels
                ? (isChannel1 ? 'Lead' : 'Employee')
                : (isChannel1 ? 'Employee' : 'Lead')
              return {
                speaker,
                text: u.text,
                start: u.start,
                end: u.end,
                channel: u.channel,
              }
            })

            // Format transcription with speaker labels for GPT analysis
            transcription = transcript.utterances
              .map((u) => {
                const isChannel1 = String(u.channel) === '1'
                const speaker = useInvertedChannels
                  ? (isChannel1 ? 'Lead' : 'Employee')
                  : (isChannel1 ? 'Employee' : 'Lead')
                return `${speaker}: ${u.text}`
              })
              .join('\n')

            // Save transcription and diarization data
            await getSupabaseAdmin()
              .from('calls')
              .update({
                transcription,
                transcription_provider: 'assemblyai_multichannel',
                ai_analysis_status: 'processing',
                custom_fields: {
                  ...((call.custom_fields as Record<string, unknown>) || {}),
                  diarized_transcript: diarizedTranscript,
                },
              })
              .eq('id', callId)

            console.log('Speaker diarization complete. Proceeding to GPT analysis...')
          } else if (transcript.status === 'error') {
            throw new Error(`AssemblyAI error: ${transcript.error}`)
          }
        } else {
          // Fallback: OpenAI Whisper (no speaker diarization)
          console.log('AssemblyAI not configured, using OpenAI Whisper (no speaker labels)')

          const openai = getOpenAI()
          if (!openai) {
            throw new Error('OpenAI API key not configured')
          }

          // Use the already-downloaded audio buffer
          const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
          const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mpeg' })

          const transcriptionResponse = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language: 'en',
            response_format: 'text',
          })

          transcription = transcriptionResponse

          await getSupabaseAdmin()
            .from('calls')
            .update({
              transcription,
              transcription_provider: 'openai_whisper',
              ai_analysis_status: 'processing',
            })
            .eq('id', callId)
        }
      } catch (transcribeError) {
        console.error('Transcription error:', transcribeError)
      }
    }

    // Step 2: Use OpenAI GPT for ALL analysis (summary, sentiment, tasks, etc.)
    if (!transcription && !call.outcome_notes) {
      return NextResponse.json({ error: 'No content to analyze' }, { status: 400 })
    }

    const contentToAnalyze = transcription || call.outcome_notes || ''
    const contactName = call.contact
      ? `${call.contact.first_name} ${call.contact.last_name}`
      : 'Unknown Contact'

    const now = new Date()
    const callTime = call.started_at ? new Date(call.started_at) : now

    console.log('Using OpenAI GPT for call analysis...')

    // Get employee name if available
    const employeeName = call.user?.first_name && call.user?.last_name
      ? `${call.user.first_name} ${call.user.last_name}`
      : 'the sales representative'

    const analysisPrompt = `You are an AI assistant for Citadel Gold's CRM system. Citadel Gold is a precious metals investment company.

CRITICAL CONTEXT:
- The EMPLOYEE works for Citadel Gold (our company)
- The LEAD/CUSTOMER is the person the employee is talking to (a potential investor)
- For INBOUND calls: The customer CALLED our company seeking information
- For OUTBOUND calls: Our employee CALLED the customer
- In the transcript, "Employee:" labels OUR sales rep, "Lead:" labels THE CUSTOMER

Analyze the following call transcript/notes and extract:

1. A brief summary (2-3 sentences)
2. Customer sentiment (positive, neutral, negative)
3. Key topics discussed
4. Any objections raised by the customer
5. Actionable follow-up tasks for the sales rep
6. **COMPLIANCE CHECK**: Flag any unethical, misleading, or non-compliant statements made by the EMPLOYEE

Call Details:
- Direction: ${call.direction}
- Our Employee: ${employeeName}
- Contact: ${contactName}
- Duration: ${call.duration_seconds} seconds
- Call Time: ${callTime.toISOString()}
- Current Time: ${now.toISOString()}

Content to analyze:
${contentToAnalyze}

IMPORTANT for action_items: If a specific time is mentioned for a task (e.g., "call back at 5pm", "call me tomorrow at 3:30", "send documents by tomorrow morning", "follow up at 3pm today"), you MUST extract that exact datetime and provide it in the "due_datetime" field as an ISO 8601 string.

TIME EXTRACTION RULES:
- "3:30" or "3:30pm" or "330" means 3:30 PM (15:30) - afternoon times are the default unless AM is specified
- "tomorrow at 3:30" means the next day at 15:30
- "today at 5" means today at 17:00
- "morning" means 9:00 AM, "afternoon" means 2:00 PM, "evening" means 6:00 PM
- Always use the call's current time as reference for relative times like "today", "tomorrow", "this afternoon"
- If a callback time is mentioned, set task_type to "call_back" and include the exact scheduled time

Use the call time (${now.toISOString()}) as reference for relative times.

COMPLIANCE CHECK INSTRUCTIONS:
Carefully review ONLY what the EMPLOYEE said. Flag any statements that are:
- **Guarantees**: Promising specific returns, profits, or outcomes (e.g., "you'll make 3x your money", "gold always goes up", "you're guaranteed to profit")
- **Misleading claims**: Exaggerating benefits, downplaying risks, or making claims that can't be substantiated
- **Pressure tactics**: Inappropriate urgency or manipulation (e.g., "this is your last chance", "you'd be stupid not to")
- **False statements**: Lies about the company, product, fees, or competitors
- **Regulatory violations**: Claiming to be a financial advisor when not licensed, giving specific investment advice

For each violation found, provide:
- The exact quote or paraphrase of what was said
- Why it's problematic
- What they SHOULD have said instead (compliant alternative)

Respond in JSON format:
{
  "summary": "Brief summary of the call",
  "sentiment": "positive|neutral|negative",
  "sentiment_score": 0.0 to 1.0,
  "key_topics": ["topic1", "topic2"],
  "objections": ["objection1", "objection2"],
  "lead_quality_score": 1-10,
  "close_probability": 0-100,
  "action_items": [
    {
      "title": "Task title - for call_back tasks, include time like 'Call back John - scheduled for 3:30 PM'",
      "description": "Detailed description including any specific time mentioned",
      "priority": 1-5 (1=highest),
      "task_type": "follow_up|call_back|send_docs|review|other",
      "due_days": number of days from now (fallback if no specific time),
      "due_datetime": "ISO 8601 datetime string - REQUIRED if any specific time was mentioned (e.g., '3:30', 'tomorrow at 2pm', 'Friday morning'). Use 24-hour format.",
      "scheduled_time_display": "Human readable time like '3:30 PM tomorrow' or '2:00 PM on Friday' - only if specific time mentioned"
    }
  ],
  "compliance_warnings": [
    {
      "severity": "high|medium|low",
      "category": "guarantee|misleading|pressure|false_statement|regulatory",
      "quote": "Exact quote or close paraphrase of what was said",
      "issue": "Brief explanation of why this is problematic",
      "suggestion": "What they should have said instead - a compliant alternative"
    }
  ],
  "email_draft_request": {
    "should_draft": true/false,
    "content_hints": ["brochure", "pricing info", "documents mentioned in call"],
    "tone_from_call": "friendly/professional/casual/formal",
    "due_datetime": "ISO 8601 datetime if specific time mentioned for sending, otherwise null",
    "commitment_quote": "Exact quote of the email sending commitment"
  },
  "funnel_enrollment": {
    "should_enroll": true/false,
    "reasoning": "Brief explanation of why this lead should/shouldn't receive automated email nurture",
    "suggested_tags": ["tag1", "tag2", "tag3"],
    "urgency": "immediate|within_24h|within_week|not_urgent"
  },
  "extracted_lead_info": {
    "first_name": "Lead's first name if mentioned (e.g., 'Hi, I'm Margaret' -> 'Margaret')",
    "last_name": "Lead's last name if mentioned (e.g., 'My name is Margaret Walsh' -> 'Walsh')",
    "email": "Lead's email address - IMPORTANT: Convert spelled-out emails to proper format",
    "company": "Lead's company or employer if mentioned",
    "occupation": "Lead's job title or occupation if mentioned",
    "city": "City if mentioned",
    "state": "State if mentioned",
    "notes": "Any other relevant personal details mentioned (spouse name, retirement plans, etc.)"
  }
}

EMAIL DRAFT DETECTION: If the EMPLOYEE promises to send something via email (e.g., "I'll send you the brochure", "Let me email that over", "I'll get that information to you by email", "I'll send you the pricing by 5pm"), set should_draft=true and extract what they promised to send in content_hints.

FUNNEL ENROLLMENT ANALYSIS:
Determine if this lead should be automatically enrolled in an email nurture sequence.
Consider:
- Did they show genuine interest? (not just polite listening or explicit disinterest)
- Is this an inbound call (they reached out) or outbound (we called them)?
- What stage are they at? (cold, warming, warm, hot)
- Do they need education about the product?
- Are they a high-value prospect worth nurturing?
- Did they ask to be removed or say they're not interested?

Set should_enroll=true if the lead would benefit from automated email follow-up.
Set should_enroll=false if they're not interested, asked to stop contact, or are already ready to close.

Generate 3-5 suggested_tags that describe the IDEAL email funnel for this lead:
- Call direction: "inbound_call" or "outbound_call"
- Interest level: "highly_interested", "somewhat_interested", "just_curious", "not_interested"
- Stage: "cold_lead", "warm_lead", "hot_lead", "ready_to_close"
- Needs: "needs_education", "needs_pricing", "needs_reassurance"
- Value: "high_value" (>$50k), "medium_value", "starter_value"
- Timeline: "urgent_timeline", "retirement_soon", "long_term"
- Product interest: "gold_ira", "silver", "diversification"

Set urgency based on how quickly the first email should go out:
- "immediate": Hot lead, strike while iron is hot
- "within_24h": Interested, follow up soon
- "within_week": Warm lead, standard nurture
- "not_urgent": Cool lead, slow drip okay

LEAD INFO EXTRACTION - CRITICAL:
The "Lead" is the CUSTOMER/PROSPECT, NOT the sales employee.
- For INBOUND calls: The lead is the person who CALLED IN (the customer seeking information)
- For OUTBOUND calls: The lead is the person who was CALLED (the customer being contacted)
- The lead is NEVER the sales rep/employee from our company

Listen carefully for when the LEAD (customer) introduces themselves or provides personal information. Extract:
- Name: "Hi, I'm Margaret Walsh" or "This is John" or "My name is..."
- Email: Any email address the CUSTOMER provides (see EMAIL PARSING below)
- Company/Employer: Where the CUSTOMER works - "I work at IBM" or "I'm retired from the postal service"
- Location: "I'm calling from Phoenix" or "I live in Arizona"
- Other details: Spouse mentions, retirement timeline, etc.

EMAIL PARSING - CRITICAL:
People often SPELL OUT their email addresses on phone calls. You MUST convert these to proper email format:
- "d-e-v-i-n at gmail dot com" → "devin@gmail.com"
- "john underscore smith at yahoo dot com" → "john_smith@yahoo.com"
- "mary dot jones at outlook dot com" → "mary.jones@outlook.com"
- "bob 1 2 3 at hotmail dot com" → "bob123@hotmail.com"
- "It's margaret, M-A-R-G-A-R-E-T, at gmail, G-M-A-I-L, dot com" → "margaret@gmail.com"
- "my email is fox with an F-O-X at citadel gold dot com" → "fox@citadelgold.com"
Listen for: spelled letters, "at" or "at sign", "dot", "underscore", numbers spelled out, etc.
ALWAYS output the email in lowercase standard format (example@domain.com).

DO NOT extract the sales employee's information. Only extract the CUSTOMER's information.
Leave fields null if not clearly mentioned by the customer.`

    // ALL AI analysis done by OpenAI GPT
    const openai = getOpenAI()
    if (!openai) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const analysisResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that analyzes sales calls for a Gold IRA company. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: analysisPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const analysisContent = analysisResponse.choices[0]?.message?.content
    if (!analysisContent) {
      throw new Error('No analysis response from OpenAI')
    }

    const analysis = JSON.parse(analysisContent)
    console.log('GPT analysis complete:', { summary: analysis.summary, sentiment: analysis.sentiment })

    // Log compliance warnings if any
    if (analysis.compliance_warnings && analysis.compliance_warnings.length > 0) {
      console.log('⚠️ COMPLIANCE WARNINGS DETECTED:', analysis.compliance_warnings.length)
      analysis.compliance_warnings.forEach((w: { severity: string; category: string; quote: string }) => {
        console.log(`  - [${w.severity.toUpperCase()}] ${w.category}: "${w.quote}"`)
      })
    }

    // Step 3: Save GPT analysis results
    await getSupabaseAdmin()
      .from('calls')
      .update({
        ai_analysis_status: 'completed',
        ai_analyzed_at: new Date().toISOString(),
        ai_summary: analysis.summary,
        ai_sentiment: analysis.sentiment,
        ai_sentiment_score: analysis.sentiment_score,
        ai_key_topics: analysis.key_topics,
        ai_objections: analysis.objections,
        ai_action_items: analysis.action_items?.map((a: ActionItem) => a.title),
        ai_lead_quality_score: analysis.lead_quality_score,
        ai_close_probability: analysis.close_probability,
        ai_raw_response: analysis,
        ai_tasks_generated: true,
        ai_processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        compliance_warnings: analysis.compliance_warnings || [],
      })
      .eq('id', callId)

    // Step 3.5: Auto-create lead from extracted info if no lead exists
    let newLeadId: string | null = null
    const extractedLeadInfo = analysis.extracted_lead_info as ExtractedLeadInfo | undefined

    if (!call.lead_id && extractedLeadInfo) {
      // Check if we have enough info to create a lead (at minimum a name or the phone number)
      const hasName = extractedLeadInfo.first_name || extractedLeadInfo.last_name
      const phoneNumber = call.direction === 'inbound' ? call.from_number : call.to_number

      if (hasName || phoneNumber) {
        console.log('Creating new lead from call info:', { extractedLeadInfo, phoneNumber })

        // Check if a lead with this phone number already exists
        let existingLead = null
        if (phoneNumber) {
          const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10)
          const { data: foundLead } = await getSupabaseAdmin()
            .from('leads')
            .select('id, owner_id, email, first_name, last_name')
            .or(`phone.ilike.%${cleanPhone}%,phone_secondary.ilike.%${cleanPhone}%`)
            .limit(1)
            .single()

          existingLead = foundLead
        }

        if (existingLead) {
          // Link call to existing lead and update info if needed
          newLeadId = existingLead.id
          console.log('Found existing lead by phone:', newLeadId)

          // Build update object for existing lead
          const leadUpdates: Record<string, unknown> = {}

          // Assign owner if lead has no owner
          if (!existingLead.owner_id && ownerId) {
            leadUpdates.owner_id = ownerId
            console.log('Assigning owner to existing lead:', ownerId)
          }

          // Update email if lead doesn't have one and we extracted one
          if (!existingLead.email && extractedLeadInfo.email) {
            leadUpdates.email = extractedLeadInfo.email
            console.log('Adding email to existing lead:', extractedLeadInfo.email)
          }

          // Update name if lead has "Unknown" as first_name and we extracted a name
          if (existingLead.first_name === 'Unknown' && extractedLeadInfo.first_name) {
            leadUpdates.first_name = extractedLeadInfo.first_name
            if (extractedLeadInfo.last_name) {
              leadUpdates.last_name = extractedLeadInfo.last_name
            }
            console.log('Updating name for existing lead:', extractedLeadInfo.first_name, extractedLeadInfo.last_name)
          }

          // Apply updates if any
          if (Object.keys(leadUpdates).length > 0) {
            leadUpdates.updated_at = new Date().toISOString()
            await getSupabaseAdmin()
              .from('leads')
              .update(leadUpdates)
              .eq('id', existingLead.id)
            console.log('✅ Updated existing lead with new info')
          }
        } else {
          // Create new lead
          // Build notes from occupation and other details
          let notesContent = ''
          if (extractedLeadInfo.occupation) {
            notesContent = `Occupation: ${extractedLeadInfo.occupation}`
          }
          if (extractedLeadInfo.notes) {
            notesContent = notesContent ? `${notesContent}\n${extractedLeadInfo.notes}` : extractedLeadInfo.notes
          }

          // Get the AI Generated system group for this lead
          const aiGroupId = organizationId ? await getAIGeneratedGroup(organizationId) : null

          const leadData: Record<string, unknown> = {
            first_name: extractedLeadInfo.first_name || 'Unknown',
            last_name: extractedLeadInfo.last_name || '',
            phone: phoneNumber || null,
            email: extractedLeadInfo.email || null,
            status: 'new',
            source_type: call.direction === 'inbound' ? 'inbound_call' : 'outbound_call',
            owner_id: ownerId, // Employee who handled the call
            notes: notesContent || null,
            city: extractedLeadInfo.city || null,
            state: extractedLeadInfo.state || null,
            organization_id: organizationId,
            import_job_id: aiGroupId, // Assign to AI Generated group
          }

          console.log('Creating new lead with data:', {
            name: `${leadData.first_name} ${leadData.last_name}`,
            phone: leadData.phone,
            email: leadData.email,
            owner_id: leadData.owner_id,
            source: leadData.source_type,
            import_job_id: leadData.import_job_id,
          })

          const { data: newLead, error: leadError } = await getSupabaseAdmin()
            .from('leads')
            .insert(leadData)
            .select('id, first_name, last_name')
            .single()

          if (leadError) {
            console.error('Error creating lead:', leadError)
          } else if (newLead) {
            newLeadId = newLead.id
            console.log('✅ Created new lead from call:', newLead.first_name, newLead.last_name, newLeadId)
          }
        }

        // Update the call with the new lead_id
        if (newLeadId) {
          await getSupabaseAdmin()
            .from('calls')
            .update({ lead_id: newLeadId, updated_at: new Date().toISOString() })
            .eq('id', callId)

          // Update local call object so subsequent steps use the new lead_id
          call.lead_id = newLeadId
        }
      }
    }

    // Step 4: Create tasks from GPT-extracted action items
    const tasksCreated: string[] = []
    if (analysis.action_items && analysis.action_items.length > 0 && ownerId) {
      for (const item of analysis.action_items as ActionItem[]) {
        let dueDate: Date
        let hasSpecificTime = false

        if (item.due_datetime) {
          const parsedDate = new Date(item.due_datetime)
          if (!isNaN(parsedDate.getTime()) && parsedDate > new Date()) {
            dueDate = parsedDate
            hasSpecificTime = true
          } else {
            dueDate = new Date()
            dueDate.setDate(dueDate.getDate() + (item.due_days || 1))
          }
        } else {
          dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + (item.due_days || 1))
        }

        // Set reminder to 30 minutes before due date
        const reminderDate = new Date(dueDate.getTime() - 30 * 60 * 1000)

        // Format task title for call_back tasks with scheduled time
        let taskTitle = item.title
        if (item.task_type === 'call_back' && hasSpecificTime && item.scheduled_time_display) {
          // If the title doesn't already mention the time, add it
          if (!taskTitle.toLowerCase().includes('scheduled') && !taskTitle.includes(':')) {
            taskTitle = `${taskTitle} - call scheduled for ${item.scheduled_time_display}`
          }
        }

        // Add description note about scheduled time
        let taskDescription = item.description || ''
        if (hasSpecificTime && item.scheduled_time_display) {
          if (!taskDescription.toLowerCase().includes('scheduled')) {
            taskDescription = `${taskDescription}\n\nScheduled time: ${item.scheduled_time_display}`
          }
        }

        const { data: task, error: taskError } = await getSupabaseAdmin()
          .from('tasks')
          .insert({
            title: taskTitle,
            description: taskDescription.trim(),
            assigned_to: ownerId,
            assigned_by: null,
            call_id: callId,
            contact_id: call.contact_id,
            deal_id: call.deal_id,
            lead_id: call.lead_id,
            due_at: dueDate.toISOString(),
            reminder_at: reminderDate.toISOString(),
            priority: item.priority || 3,
            task_type: item.task_type || 'follow_up',
            source: 'ai_call_analysis',
            status: 'pending',
          })
          .select('id')
          .single()

        if (!taskError && task) {
          tasksCreated.push(task.id)
        }
      }
    }

    // Step 5: Auto-generate email draft if email commitment detected
    let emailDraftCreated = false
    const emailDraftRequest = analysis.email_draft_request as EmailDraftRequest | undefined
    if (emailDraftRequest?.should_draft && ownerId) {
      try {
        console.log('Email commitment detected, checking for existing draft...')

        // Check if a draft already exists for this call (prevent duplicates)
        const { data: existingDraft } = await getSupabaseAdmin()
          .from('email_drafts')
          .select('id')
          .eq('call_id', callId)
          .single()

        if (existingDraft) {
          console.log('Email draft already exists for this call, skipping:', existingDraft.id)
          emailDraftCreated = true // Mark as created since it exists
        } else {
          console.log('No existing draft, generating new one...')

          // Find lead info - try from lead_id first, then phone number
          let leadInfo = null
        if (call.lead_id) {
          const { data: lead } = await getSupabaseAdmin()
            .from('leads')
            .select('id, first_name, last_name, email')
            .eq('id', call.lead_id)
            .single()

          if (lead?.email) {
            leadInfo = {
              lead_id: lead.id,
              lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
              lead_email: lead.email
            }
          }
        }

        // If no lead found by ID, try phone number
        if (!leadInfo && call.phone_number) {
          leadInfo = await findLeadByPhone(call.phone_number)
        }

        if (leadInfo?.lead_email && leadInfo?.lead_id) {
          // Match relevant documents
          let matchedDocumentIds: string[] = []
          try {
            const matchResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '')}/api/documents/match`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: ownerId,
                search_hints: emailDraftRequest.content_hints,
                context: analysis.summary
              })
            })

            if (matchResponse.ok) {
              const matchData = await matchResponse.json()
              matchedDocumentIds = matchData.matched_documents?.map((d: { id: string }) => d.id) || []
            }
          } catch (matchError) {
            console.log('Document matching skipped:', matchError)
          }

          // Generate email draft
          const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
          const draftResponse = await fetch(`${baseUrl}/api/email/draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: ownerId,
              lead_id: leadInfo.lead_id,
              call_id: callId,
              content_hints: emailDraftRequest.content_hints,
              tone: emailDraftRequest.tone_from_call,
              document_ids: matchedDocumentIds,
              due_at: emailDraftRequest.due_datetime,
              commitment_quote: emailDraftRequest.commitment_quote
            })
          })

          if (draftResponse.ok) {
            emailDraftCreated = true
            console.log('Email draft created successfully for', leadInfo.lead_name)
          } else {
            console.error('Failed to create email draft:', await draftResponse.text())
          }
        } else {
          console.log('Cannot create email draft: lead email not found')
        }
        } // Close the else block for "no existing draft"
      } catch (draftError) {
        console.error('Error creating email draft:', draftError)
      }
    }

    // Step 6: Auto-enroll in email funnel if recommended (as pending approval draft)
    let funnelEnrollmentResult: { enrolled: boolean; pending_approval?: boolean; enrollment_id?: string; funnel_id?: string; funnel_name?: string; match_reason?: string } = { enrolled: false }
    const funnelEnrollment = analysis.funnel_enrollment as FunnelEnrollment | undefined
    const leadIdForFunnel = call.lead_id || newLeadId

    if (funnelEnrollment?.should_enroll && leadIdForFunnel && ownerId) {
      try {
        console.log('Funnel enrollment recommended, using semantic matching...')

        // Use OpenAI semantic matching to find best funnel
        const matchedFunnel = await findMatchingFunnelSemantic(
          analysis.summary || '',
          {
            direction: call.direction === 'inbound' ? 'inbound' : 'outbound',
            sentiment: analysis.sentiment || 'neutral',
            keyTopics: analysis.key_topics || [],
            isNewLead: !!newLeadId,
            interestLevel: funnelEnrollment.suggested_tags?.find((t: string) => t.includes('interested')) || undefined
          },
          getSupabaseAdmin()
        )

        if (matchedFunnel) {
          console.log('AI matched funnel:', matchedFunnel.funnel_name, 'reason:', matchedFunnel.match_reason)

          // Check if lead is already enrolled in this funnel
          const { data: existingEnrollment } = await getSupabaseAdmin()
            .from('email_funnel_enrollments')
            .select('id')
            .eq('funnel_id', matchedFunnel.funnel_id)
            .eq('lead_id', leadIdForFunnel)
            .in('status', ['active', 'paused'])
            .single()

          if (!existingEnrollment) {
            // Get first phase delay for scheduling
            const { data: phases } = await getSupabaseAdmin()
              .from('email_funnel_phases')
              .select('delay_days, delay_hours')
              .eq('funnel_id', matchedFunnel.funnel_id)
              .order('phase_order', { ascending: true })
              .limit(1)

            const firstPhase = phases?.[0]
            let delayMs = ((firstPhase?.delay_days || 0) * 24 * 60 + (firstPhase?.delay_hours || 0) * 60) * 60 * 1000

            // Adjust delay based on urgency
            const urgencyMultiplier: Record<string, number> = {
              immediate: 0,
              within_24h: 0.5,
              within_week: 1,
              not_urgent: 2
            }
            const multiplier = urgencyMultiplier[funnelEnrollment.urgency] ?? 1
            delayMs = Math.round(delayMs * multiplier)

            // Minimum delay of 5 minutes for "immediate" to avoid overwhelming
            if (funnelEnrollment.urgency === 'immediate' && delayMs < 5 * 60 * 1000) {
              delayMs = 5 * 60 * 1000
            }

            const nextEmailAt = new Date(Date.now() + delayMs).toISOString()

            // Create enrollment as pending approval (draft)
            const { data: enrollmentData, error: enrollError } = await getSupabaseAdmin().from('email_funnel_enrollments').insert({
              funnel_id: matchedFunnel.funnel_id,
              lead_id: leadIdForFunnel,
              status: 'pending_approval',
              current_phase: 1,
              enrolled_at: new Date().toISOString(),
              enrolled_by: ownerId,
              next_email_scheduled_at: nextEmailAt,
              match_reason: matchedFunnel.match_reason,
            }).select('id').single()

            if (!enrollError && enrollmentData) {
              // Don't increment count yet - only when approved
              funnelEnrollmentResult = {
                enrolled: true,
                pending_approval: true,
                enrollment_id: enrollmentData.id,
                funnel_id: matchedFunnel.funnel_id,
                funnel_name: matchedFunnel.funnel_name,
                match_reason: matchedFunnel.match_reason
              }
              console.log('Lead enrollment draft created for funnel:', matchedFunnel.funnel_name)
            } else {
              console.error('Error enrolling in funnel:', enrollError)
            }
          } else {
            console.log('Lead already enrolled in this funnel')
          }
        } else {
          console.log('No matching funnel found by AI')
        }
      } catch (funnelError) {
        console.error('Error with funnel enrollment:', funnelError)
      }
    }

    // Step 7: Generate/update lead profile based on ALL call history
    let leadProfileUpdated = false
    const leadIdForProfile = call.lead_id || newLeadId // Use newLeadId if call.lead_id wasn't set

    if (leadIdForProfile) {
      try {
        console.log('Generating lead profile analysis for lead:', leadIdForProfile)

        // Get lead info including existing AI profile for evolution
        const { data: lead } = await getSupabaseAdmin()
          .from('leads')
          .select('id, first_name, last_name, email, phone, status, source_type, notes, ai_profile_summary, ai_profile_details, ai_coaching_tips')
          .eq('id', leadIdForProfile)
          .single()

        // Get ALL calls for this lead
        const { data: dbCalls } = await getSupabaseAdmin()
          .from('calls')
          .select('id, transcription, ai_summary, ai_sentiment, ai_key_topics, ai_objections, started_at, duration_seconds, direction')
          .eq('lead_id', leadIdForProfile)
          .eq('is_deleted', false)
          .not('transcription', 'is', null)
          .order('started_at', { ascending: true })

        // Ensure current call is included (in case DB hasn't synced yet)
        let allCalls = dbCalls || []
        const currentCallInList = allCalls.some(c => c.id === callId)
        if (!currentCallInList && analysis.summary) {
          // Add current call data to the list
          console.log('Adding current call to profile analysis (not yet in DB query results)')
          allCalls = [...allCalls, {
            id: callId,
            transcription: typeof transcription === 'string' ? transcription : JSON.stringify(transcription),
            ai_summary: analysis.summary,
            ai_sentiment: analysis.sentiment,
            ai_key_topics: analysis.key_topics,
            ai_objections: analysis.objections,
            started_at: call.started_at,
            duration_seconds: call.duration_seconds,
            direction: call.direction,
          }]
        }

        // Get ALL emails for this lead
        const leadEmail = lead?.email?.toLowerCase().trim()
        const { data: allEmails } = await getSupabaseAdmin()
          .from('emails')
          .select('id, from_address, to_addresses, subject, body_text, snippet, ai_summary, ai_sentiment, ai_intent, ai_key_topics, ai_action_items, ai_commitments, ai_requests, sent_at, created_at, is_inbound, lead_id')
          .eq('is_deleted', false)

        // Filter emails that belong to this lead
        const leadEmails = (allEmails || []).filter(email => {
          if (email.lead_id === leadIdForProfile) return true
          if (leadEmail) {
            if (email.from_address?.toLowerCase().trim() === leadEmail) return true
            const toAddrs = email.to_addresses as Array<{ email: string }> | null
            if (toAddrs?.some(t => t.email?.toLowerCase().trim() === leadEmail)) return true
          }
          return false
        })

        console.log('Profile generation check:', {
          hasLead: !!lead,
          callCount: allCalls.length,
          emailCount: leadEmails.length,
          leadId: leadIdForProfile,
        })

        if (lead && ((allCalls && allCalls.length > 0) || leadEmails.length > 0)) {
          // Get existing AI profile for evolution
          const existingProfile = lead.ai_profile_details || {}
          const existingSummary = lead.ai_profile_summary || ''
          const existingTips = lead.ai_coaching_tips || []

          // Compile ALL call data with FULL transcripts for comprehensive analysis
          const callSummaries = (allCalls || []).length > 0 ? (allCalls || []).map((c, idx) => {
            const date = c.started_at ? new Date(c.started_at).toLocaleDateString() : 'Unknown date'
            const duration = Math.round((c.duration_seconds || 0) / 60)
            return `=== CALL ${idx + 1} (${date}, ${c.direction}, ${duration} mins) ===
AI Summary: ${c.ai_summary || 'No summary available'}
Sentiment: ${c.ai_sentiment || 'Unknown'}
Key Topics: ${(c.ai_key_topics || []).join(', ') || 'None identified'}
Objections Raised: ${(c.ai_objections || []).join(', ') || 'None'}

FULL TRANSCRIPT:
${c.transcription || '(No transcript available)'}`
          }).join('\n\n' + '='.repeat(50) + '\n\n') : 'No call history available'

          // Compile ALL email data for comprehensive analysis
          const emailSummaries = leadEmails.length > 0 ? leadEmails.map((e, idx) => {
            const date = e.sent_at || e.created_at ? new Date(e.sent_at || e.created_at).toLocaleDateString() : 'Unknown date'
            const direction = e.is_inbound ? 'RECEIVED FROM LEAD' : 'SENT TO LEAD'
            const commitments = e.ai_commitments as Array<{ who: string; what: string; when: string }> | null
            const requests = e.ai_requests as Array<{ what: string; urgency: string }> | null
            return `=== EMAIL ${idx + 1} (${date}, ${direction}) ===
Subject: ${e.subject || '(no subject)'}
AI Summary: ${e.ai_summary || e.snippet || 'No summary available'}
Sentiment: ${e.ai_sentiment || 'Unknown'}
Intent: ${e.ai_intent || 'Unknown'}
Key Topics: ${(e.ai_key_topics || []).join(', ') || 'None identified'}
Action Items: ${(e.ai_action_items || []).join(', ') || 'None'}
Commitments Made: ${commitments?.map(c => `${c.who}: ${c.what} (${c.when || 'no timeline'})`).join('; ') || 'None'}
Requests: ${requests?.map(r => `${r.what} (${r.urgency})`).join('; ') || 'None'}

EMAIL CONTENT:
${(e.body_text || '').substring(0, 1500) || '(No content available)'}${(e.body_text || '').length > 1500 ? '...(truncated)' : ''}`
          }).join('\n\n' + '='.repeat(50) + '\n\n') : 'No email history available'

          const totalCallMinutes = (allCalls || []).reduce((sum: number, c) => sum + Math.round((c.duration_seconds || 0) / 60), 0)
          const sentimentScores = (allCalls || []).map(c => c.ai_sentiment === 'positive' ? 1 : c.ai_sentiment === 'negative' ? -1 : 0)
          const avgSentiment = sentimentScores.length > 0
            ? sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length
            : 0

          // Email statistics
          const totalEmails = leadEmails.length
          const inboundEmails = leadEmails.filter(e => e.is_inbound).length
          const outboundEmails = leadEmails.filter(e => !e.is_inbound).length

          const profilePrompt = `You are an ELITE Gold IRA sales psychologist and closing expert. Your job is to build an EVOLVING psychological profile of this lead that gets SHARPER and more ACTIONABLE with every call.

=== LEAD INFORMATION ===
Name: ${lead.first_name} ${lead.last_name}
Email: ${lead.email || 'Unknown'}
Phone: ${lead.phone || 'Unknown'}
Current Status: ${lead.status || 'Unknown'}
Lead Source: ${lead.source_type || 'Unknown'}
Initial Notes: ${lead.notes || 'None'}

=== COMMUNICATION HISTORY STATISTICS ===
Total Calls: ${(allCalls || []).length}
Total Talk Time: ${totalCallMinutes} minutes
Call Sentiment Trend: ${avgSentiment > 0.3 ? 'WARMING UP' : avgSentiment < -0.3 ? 'COOLING OFF' : 'NEUTRAL'}
Total Emails: ${totalEmails} (${inboundEmails} received from lead, ${outboundEmails} sent to lead)

=== PREVIOUS AI PROFILE (BUILD ON THIS) ===
Previous Summary: ${existingSummary || 'No previous summary'}
Previous Assessment: ${existingProfile.overall_assessment || 'None'}
Previous Tips Used: ${existingTips.slice(0, 3).join('; ') || 'None'}

=== COMPLETE CALL TRANSCRIPTS ===
${callSummaries}

=== COMPLETE EMAIL HISTORY ===
${emailSummaries}

=== YOUR MISSION ===
Create an EVOLVED character profile that captures WHO this person really is. Analyze BOTH their call transcripts AND email communications - every word they say or write reveals something about their psychology, fears, desires, and buying triggers. Build on the previous profile but make it SHARPER and more SPECIFIC with each interaction.

Respond in JSON format:
{
  "profile_summary": "A vivid 3-4 sentence CHARACTER SKETCH. Paint a picture of who this person is - their situation, their fears, their desires, their readiness to act. Be specific about dollar amounts, timelines, and emotional state. This should read like a dossier.",

  "profile_details": {
    "demographics": {
      "estimated_age": "Best estimate with reasoning",
      "location": "City/State if mentioned",
      "occupation": "Job title or industry - this affects pitch angle",
      "family_situation": "Spouse involved? Kids? This affects decision dynamics"
    },
    "financial_profile": {
      "investment_capacity": "SPECIFIC dollar amount or range they can invest",
      "current_holdings": "What accounts do they have? 401k, IRA, TSP, pension, savings?",
      "retirement_timeline": "When are they retiring? This creates URGENCY",
      "financial_concerns": "What keeps them up at night about money?",
      "purchase_history": ["Any previous precious metals or investment purchases mentioned"]
    },
    "psychological_profile": {
      "decision_making_style": "Are they analytical, emotional, impulsive, or deliberate?",
      "trust_level": "Scale 1-10 - how much do they trust us/the company?",
      "fear_factors": ["What are they afraid of? Market crash? Inflation? Missing out?"],
      "desire_factors": ["What do they WANT? Security? Growth? Legacy? Control?"],
      "buying_triggers": ["What specific words/concepts make them lean forward?"],
      "resistance_patterns": ["What makes them pull back or hesitate?"]
    },
    "communication_insights": {
      "preferred_style": "Direct? Consultative? Educational? Relationship-first?",
      "hot_buttons": ["Words/topics that get positive reactions"],
      "cold_buttons": ["Words/topics to AVOID"],
      "pace_preference": "Do they want fast action or time to think?",
      "best_contact_times": "When have they been most receptive?"
    },
    "relationship_status": {
      "rapport_level": "cold/warming/warm/hot/ready_to_close",
      "trust_built": "What have we done that built trust?",
      "objections_overcome": ["Objections we've already handled"],
      "objections_remaining": ["Objections still to address"],
      "next_milestone": "What's the next step to move them forward?"
    },
    "key_intelligence": ["Critical facts/quotes that could close this deal"]
  },

  "coaching_tips": [
    "OPENING MOVE: Exactly how to start the next call based on where we left off",
    "MONEY TALK: How to bring up/confirm the investment amount naturally",
    "OBJECTION CRUSHER: Specific response to their main remaining objection",
    "URGENCY PLAY: How to create time pressure without being pushy",
    "CLOSING SEQUENCE: The exact path from hello to 'let's get started'",
    "IF THEY STALL: Backup approach if they try to delay",
    "POWER PHRASE: A specific sentence that will resonate with THIS person"
  ],

  "overall_assessment": "DIRECT verdict: Are they a BUYER or a TIME-WASTER? What's their realistic close probability (%)? What's the ONE thing that will make or break this deal? Be brutally honest.",

  "evolution_notes": "What NEW did we learn from the latest call(s) that changes our approach?",

  "tags": [
    {"label": "401k", "category": "investment"},
    {"label": "$75k", "category": "budget"},
    {"label": "Analytical", "category": "personality"},
    {"label": "Wife Involved", "category": "situation"},
    {"label": "Warming Up", "category": "relationship"},
    {"label": "Inflation Fear", "category": "motivation"},
    {"label": "Q2 Retirement", "category": "timeline"}
  ]
}

TAG CATEGORIES:

**CRITICAL FOR "investment" TAGS - READ CAREFULLY:**
You must CONTEXTUALLY understand what accounts the lead ACTUALLY HAS or is considering. Do NOT just keyword match!
- If they say "I have a 401k" → tag "401k"
- If they say "I have a 401k and an IRA" → tag BOTH "401k" AND the specific IRA type
- If they say "I don't have an IRA" or "I never opened an IRA" → do NOT tag any IRA
- If they say "I'm thinking about opening an IRA" → tag "Considering IRA" (not as if they have one)
- DIFFERENTIATE IRA types when mentioned: "Traditional IRA", "Roth IRA", "SEP IRA", "SIMPLE IRA"
- If they just say "IRA" without specifying type, tag "IRA" generically
- Other investment tags: "TSP" (federal employees), "Pension", "403b", "457", "Annuity", "Brokerage", "Cash/Savings"
- If they mention MULTIPLE accounts, create MULTIPLE investment tags (one for each account type they have)

- "budget": Investment amount ($25k, $50k, $100k+, etc.) - must be based on actual amounts mentioned
- "personality": Behavioral style (Analytical, Emotional, Skeptical, Eager, Cautious, Trusting, Guarded)
- "situation": Life circumstances (Spouse Involved, Retiring Soon, Self-Employed, Business Owner, Widow/Widower, Divorced)
- "relationship": Where they are in the funnel (Cold, Warming, Hot, Ready to Close, Needs Nurturing)
- "motivation": What drives them (Inflation Fear, Market Crash, Legacy, Control, Tax Benefits, Diversification)
- "timeline": When they plan to act (Q1, Q2, End of Year, ASAP, 6+ Months, Undecided)

Generate 7-12 tags. Keep labels to 1-3 words MAX. For investment tags, include ALL account types they actually have.

CRITICAL: Your coaching tips should be SO SPECIFIC that a new rep could read them and know EXACTLY what to say. No generic advice - every tip must reference something THIS lead said or revealed.`

          const profileResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'You are a legendary Gold IRA sales coach - the kind that turns rookies into millionaires. You analyze leads like a shark smells blood in the water. Your coaching tips are AGGRESSIVE, SPECIFIC, and focused on ONE thing: CLOSING DEALS. No soft advice - give actionable, hard-hitting tips that a top closer would use. Think Gordon Gekko meets Grant Cardone. Every tip should help the agent get closer to the signature. IMPORTANT: NEVER mention CPAs, accountants, or financial advisors in your tips - we close deals directly without third-party gatekeepers. Always respond with valid JSON.',
              },
              {
                role: 'user',
                content: profilePrompt,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
          })

          const profileContent = profileResponse.choices[0]?.message?.content
          if (profileContent) {
            const profile = JSON.parse(profileContent)

            // Update lead with evolved AI profile
            await getSupabaseAdmin()
              .from('leads')
              .update({
                ai_profile_summary: profile.profile_summary,
                ai_profile_details: {
                  ...profile.profile_details,
                  overall_assessment: profile.overall_assessment,
                  evolution_notes: profile.evolution_notes,
                  call_count: (allCalls || []).length,
                  email_count: leadEmails.length,
                  total_talk_time_minutes: totalCallMinutes,
                },
                ai_coaching_tips: profile.coaching_tips,
                ai_tags: profile.tags || [],
                ai_profile_updated_at: new Date().toISOString(),
              })
              .eq('id', leadIdForProfile)

            leadProfileUpdated = true
            console.log('Lead profile evolved successfully with', allCalls.length, 'calls and', leadEmails.length, 'emails analyzed')
          }
        }
      } catch (profileError) {
        console.error('Error generating lead profile:', profileError)
        // Don't fail the whole request if profile generation fails
      }
    }

    return NextResponse.json({
      success: true,
      callId,
      summary: analysis.summary,
      sentiment: analysis.sentiment,
      tasksCreated: tasksCreated.length,
      taskIds: tasksCreated,
      emailDraftCreated,
      leadProfileUpdated,
      leadCreated: newLeadId ? true : false,
      newLeadId: newLeadId,
      extractedLeadInfo: newLeadId ? extractedLeadInfo : null,
      funnelEnrollment: funnelEnrollmentResult,
      providers: {
        diarization: assemblyai ? 'AssemblyAI' : 'none',
        analysis: 'OpenAI GPT-4o',
      },
    })
  } catch (error) {
    console.error('Call processing error:', error)

    if (callId) {
      await getSupabaseAdmin()
        .from('calls')
        .update({
          ai_analysis_status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId)
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    )
  }
}
