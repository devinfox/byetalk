import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { leadId } = body

    console.log('Starting lead profile generation scan...', leadId ? `for lead ${leadId}` : 'for all leads')

    // Get leads (single or all)
    let query = supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, status, source_type, notes')
      .eq('is_deleted', false)

    if (leadId) {
      query = query.eq('id', leadId)
    }

    const { data: leads, error: leadsError } = await query

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    console.log(`Found ${leads?.length || 0} leads`)

    // Get all calls with transcriptions
    const { data: allCalls, error: callsError } = await supabase
      .from('calls')
      .select('id, lead_id, contact_id, to_number, from_number, transcription, ai_summary, ai_sentiment, ai_key_topics, ai_objections, started_at, duration_seconds, direction')
      .eq('is_deleted', false)
      .not('transcription', 'is', null)

    if (callsError) {
      console.error('Error fetching calls:', callsError)
      return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
    }

    console.log(`Found ${allCalls?.length || 0} calls with transcriptions`)

    // Get all emails with AI analysis
    const { data: allEmails, error: emailsError } = await supabase
      .from('emails')
      .select('id, lead_id, from_address, to_addresses, subject, body_text, snippet, ai_summary, ai_sentiment, ai_intent, ai_key_topics, ai_action_items, ai_commitments, ai_requests, sent_at, created_at, is_inbound')
      .eq('is_deleted', false)

    if (emailsError) {
      console.error('Error fetching emails:', emailsError)
    }

    console.log(`Found ${allEmails?.length || 0} emails`)

    const results: { leadId: string; leadName: string; status: string; callsFound: number; emailsFound?: number; error?: string }[] = []

    // Process each lead
    for (const lead of leads || []) {
      try {
        // Find calls for this lead by:
        // 1. Direct lead_id match
        // 2. Phone number match
        const leadPhone = lead.phone?.replace(/\D/g, '') // Normalize phone
        const leadEmail = lead.email?.toLowerCase().trim()

        const leadCalls = (allCalls || []).filter(call => {
          // Direct lead_id match
          if (call.lead_id === lead.id) return true

          // Phone number match
          if (leadPhone && leadPhone.length >= 10) {
            const toPhone = call.to_number?.replace(/\D/g, '') || ''
            const fromPhone = call.from_number?.replace(/\D/g, '') || ''
            if (toPhone.includes(leadPhone) || leadPhone.includes(toPhone.slice(-10))) return true
            if (fromPhone.includes(leadPhone) || leadPhone.includes(fromPhone.slice(-10))) return true
          }

          return false
        })

        // Find emails for this lead by:
        // 1. Direct lead_id match
        // 2. Email address match in from_address or to_addresses
        const leadEmails = (allEmails || []).filter(email => {
          // Direct lead_id match
          if (email.lead_id === lead.id) return true

          // Email address match
          if (leadEmail) {
            if (email.from_address?.toLowerCase().trim() === leadEmail) return true
            // Check to_addresses (JSONB array)
            const toAddrs = email.to_addresses as Array<{ email: string }> | null
            if (toAddrs?.some(t => t.email?.toLowerCase().trim() === leadEmail)) return true
          }

          return false
        })

        // Skip if no calls AND no emails
        if (leadCalls.length === 0 && leadEmails.length === 0) {
          results.push({
            leadId: lead.id,
            leadName: `${lead.first_name} ${lead.last_name}`,
            status: 'skipped',
            callsFound: 0,
            emailsFound: 0,
          })
          continue
        }

        console.log(`Processing ${lead.first_name} ${lead.last_name} with ${leadCalls.length} calls and ${leadEmails.length} emails`)

        // Compile all call data for profile generation
        const callSummaries = leadCalls.length > 0 ? leadCalls.map((c, idx) => {
          const date = c.started_at ? new Date(c.started_at).toLocaleDateString() : 'Unknown date'
          return `Call ${idx + 1} (${date}, ${c.direction}, ${Math.round((c.duration_seconds || 0) / 60)} mins):
Summary: ${c.ai_summary || 'No summary'}
Sentiment: ${c.ai_sentiment || 'Unknown'}
Topics: ${(c.ai_key_topics || []).join(', ') || 'None'}
Objections: ${(c.ai_objections || []).join(', ') || 'None'}
Transcript excerpt: ${(c.transcription || '').substring(0, 1000)}...`
        }).join('\n\n---\n\n') : 'No call history available'

        // Compile email data for profile generation
        const emailSummaries = leadEmails.length > 0 ? leadEmails.map((e, idx) => {
          const date = e.sent_at || e.created_at ? new Date(e.sent_at || e.created_at).toLocaleDateString() : 'Unknown date'
          const direction = e.is_inbound ? 'RECEIVED' : 'SENT'
          const commitments = e.ai_commitments as Array<{ who: string; what: string; when: string }> | null
          const requests = e.ai_requests as Array<{ what: string; urgency: string }> | null
          return `Email ${idx + 1} (${date}, ${direction}):
Subject: ${e.subject || '(no subject)'}
Summary: ${e.ai_summary || e.snippet || 'No summary'}
Sentiment: ${e.ai_sentiment || 'Unknown'}
Intent: ${e.ai_intent || 'Unknown'}
Topics: ${(e.ai_key_topics || []).join(', ') || 'None'}
Action Items: ${(e.ai_action_items || []).join(', ') || 'None'}
Commitments Made: ${commitments?.map(c => `${c.who}: ${c.what} (${c.when || 'no timeline'})`).join('; ') || 'None'}
Requests: ${requests?.map(r => `${r.what} (${r.urgency})`).join('; ') || 'None'}
Content excerpt: ${(e.body_text || '').substring(0, 500)}...`
        }).join('\n\n---\n\n') : 'No email history available'

        const profilePrompt = `You are an elite Gold IRA sales coach - think Wolf of Wall Street meets precious metals. Analyze this lead's communication history (calls AND emails) and generate a killer profile with AGGRESSIVE closing tips.

Lead Info:
- Name: ${lead.first_name} ${lead.last_name}
- Email: ${lead.email || 'Unknown'}
- Phone: ${lead.phone || 'Unknown'}
- Status: ${lead.status || 'Unknown'}
- Source: ${lead.source_type || 'Unknown'}
- Notes: ${lead.notes || 'None'}

CALL HISTORY (${leadCalls.length} calls):
${callSummaries}

EMAIL HISTORY (${leadEmails.length} emails):
${emailSummaries}

Generate a detailed profile and SHARK-LEVEL coaching tips. These tips should be aggressive, direct, and focused on CLOSING THE DEAL. Think like a top 1% closer. Respond in JSON format:
{
  "profile_summary": "2-3 sentence summary - be direct about their money situation and readiness to buy",
  "profile_details": {
    "demographics": {
      "estimated_age": "age or range if mentioned",
      "location": "city/state if mentioned",
      "occupation": "if mentioned",
      "family_situation": "if mentioned"
    },
    "financial_profile": {
      "investment_capacity": "estimated amount or range - be specific about the $$$",
      "current_holdings": "what they currently have - this is ammo for the pitch",
      "purchase_history": ["list of purchases mentioned"],
      "investment_timeline": "when they plan to invest - use this to create URGENCY"
    },
    "personality_traits": ["list of observed traits - identify their buying triggers"],
    "interests_and_motivations": ["what drives them - these are your HOOKS"],
    "concerns_and_objections": ["objections to CRUSH on next call"],
    "communication_style": "how to approach them for maximum impact",
    "best_contact_times": "when to strike",
    "relationship_stage": "cold/warm/hot - how hard to push",
    "key_notes": ["important intel for closing this deal"]
  },
  "coaching_tips": [
    "Specific closing technique or approach for THIS lead",
    "How to overcome their specific objections",
    "Urgency tactics or psychological triggers to use",
    "The killer move to get them to commit",
    "Backup strategy if they hesitate"
  ],
  "overall_assessment": "Direct assessment - are they a buyer or a tire-kicker? What's the play?",
  "tags": [
    {"label": "401k", "category": "investment"},
    {"label": "$50k-100k", "category": "budget"},
    {"label": "Friendly", "category": "personality"},
    {"label": "Spousal Involvement", "category": "situation"},
    {"label": "Great Rapport", "category": "relationship"}
  ]
}

IMPORTANT FOR TAGS: Generate 7-12 short tags that give quick insights about this lead.

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

- "budget" category: Investment amount they mentioned ($25k, $50k-100k, $200k+, etc.) - must be based on actual amounts stated
- "personality" category: Their demeanor (Friendly, Skeptical, Analytical, Eager, Cautious, Trusting, Guarded)
- "situation" category: Key circumstances (Spouse Involved, Retiring Soon, Self-Employed, Business Owner, Widow/Widower)
- "relationship" category: Rapport status (Great Rapport, Warm Lead, Needs Nurturing, Ready to Close, Cold)
- "motivation" category: What drives them (Inflation Fear, Market Crash, Legacy, Control, Tax Benefits, Diversification)
- "timeline" category: When they plan to act (Q1, Q2, End of Year, ASAP, 6+ Months, Undecided)

Keep labels SHORT (1-3 words max). For investment tags, include ALL account types they actually have.`

        const openai = getOpenAI()
        if (!openai) {
          results.push({
            leadId: lead.id,
            leadName: `${lead.first_name} ${lead.last_name}`,
            status: 'error',
            callsFound: leadCalls.length,
            emailsFound: leadEmails.length,
            error: 'OpenAI API key not configured',
          })
          continue
        }

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

          // Update lead with AI profile
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              ai_profile_summary: profile.profile_summary,
              ai_profile_details: {
                ...profile.profile_details,
                overall_assessment: profile.overall_assessment,
              },
              ai_coaching_tips: profile.coaching_tips,
              ai_tags: profile.tags || [],
              ai_profile_updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id)

          if (updateError) {
            console.error(`Error updating lead ${lead.id}:`, updateError)
            results.push({
              leadId: lead.id,
              leadName: `${lead.first_name} ${lead.last_name}`,
              status: 'error',
              callsFound: leadCalls.length,
              emailsFound: leadEmails.length,
              error: updateError.message,
            })
          } else {
            console.log(`Updated profile for ${lead.first_name} ${lead.last_name}`)
            results.push({
              leadId: lead.id,
              leadName: `${lead.first_name} ${lead.last_name}`,
              status: 'success',
              callsFound: leadCalls.length,
              emailsFound: leadEmails.length,
            })
          }
        }
      } catch (err) {
        console.error(`Error processing lead ${lead.id}:`, err)
        results.push({
          leadId: lead.id,
          leadName: `${lead.first_name} ${lead.last_name}`,
          status: 'error',
          callsFound: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const successful = results.filter(r => r.status === 'success').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const failed = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      message: `Processed ${leads?.length || 0} leads`,
      successful,
      skipped,
      failed,
      totalCallsWithTranscripts: allCalls?.length || 0,
      results,
    })
  } catch (error) {
    console.error('Profile generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Profile generation failed' },
      { status: 500 }
    )
  }
}

// GET to check status
export async function GET() {
  try {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, first_name, last_name, ai_profile_summary, ai_profile_updated_at')
      .eq('is_deleted', false)

    const { data: calls } = await supabase
      .from('calls')
      .select('id, lead_id, transcription')
      .eq('is_deleted', false)
      .not('transcription', 'is', null)

    const leadsWithProfiles = leads?.filter(l => l.ai_profile_summary) || []
    const leadsWithoutProfiles = leads?.filter(l => !l.ai_profile_summary) || []

    return NextResponse.json({
      totalLeads: leads?.length || 0,
      leadsWithProfiles: leadsWithProfiles.length,
      leadsWithoutProfiles: leadsWithoutProfiles.length,
      totalCallsWithTranscripts: calls?.length || 0,
      callsWithLeadId: calls?.filter(c => c.lead_id).length || 0,
      leadsNeedingProfiles: leadsWithoutProfiles.map(l => ({
        id: l.id,
        name: `${l.first_name} ${l.last_name}`,
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
