import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

interface LeadProfile {
  profile_summary: string
  profile_details: Record<string, unknown>
  overall_assessment: string
  evolution_notes: string
  coaching_tips: string[]
  tags: string[]
}

async function generateLeadProfile(leadId: string): Promise<boolean> {
  try {
    // Get lead info
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, status, source_type, notes, ai_profile_summary, ai_profile_details, ai_coaching_tips')
      .eq('id', leadId)
      .limit(1)

    if (leadError) {
      console.log(`  ❌ Lead query error: ${leadError.message}`)
      return false
    }

    const lead = leads?.[0]
    if (!lead) {
      console.log(`  ❌ Lead not found: ${leadId}`)
      return false
    }

    // Get ALL calls for this lead
    const { data: allCalls } = await supabase
      .from('calls')
      .select('transcription, ai_summary, ai_sentiment, ai_key_topics, ai_objections, started_at, duration_seconds, direction')
      .eq('lead_id', leadId)
      .eq('is_deleted', false)
      .not('transcription', 'is', null)
      .order('started_at', { ascending: true })

    // Get ALL emails for this lead
    const leadEmail = lead.email?.toLowerCase().trim()
    const { data: allEmails } = await supabase
      .from('emails')
      .select('id, from_address, to_addresses, subject, body_text, snippet, ai_summary, ai_sentiment, ai_intent, ai_key_topics, ai_action_items, ai_commitments, ai_requests, sent_at, created_at, is_inbound, lead_id')
      .eq('is_deleted', false)

    // Filter emails that belong to this lead
    const leadEmails = (allEmails || []).filter(email => {
      if (email.lead_id === leadId) return true
      if (leadEmail) {
        if (email.from_address?.toLowerCase().trim() === leadEmail) return true
        const toAddrs = email.to_addresses as Array<{ email: string }> | null
        if (toAddrs?.some(t => t.email?.toLowerCase().trim() === leadEmail)) return true
      }
      return false
    })

    console.log(`  📊 Found ${allCalls?.length || 0} calls, ${leadEmails.length} emails`)

    if (!allCalls || allCalls.length === 0) {
      console.log(`  ⏭️  No calls to analyze, skipping`)
      return false
    }

    // Get existing AI profile for evolution
    const existingProfile = lead.ai_profile_details || {}
    const existingSummary = lead.ai_profile_summary || ''
    const existingTips = lead.ai_coaching_tips || []

    // Compile ALL call data
    const callSummaries = allCalls.map((c, idx) => {
      const date = c.started_at ? new Date(c.started_at).toLocaleDateString() : 'Unknown date'
      const duration = Math.round((c.duration_seconds || 0) / 60)
      return `=== CALL ${idx + 1} (${date}, ${c.direction}, ${duration} mins) ===
AI Summary: ${c.ai_summary || 'No summary available'}
Sentiment: ${c.ai_sentiment || 'Unknown'}
Key Topics: ${(c.ai_key_topics || []).join(', ') || 'None identified'}
Objections Raised: ${(c.ai_objections || []).join(', ') || 'None'}

FULL TRANSCRIPT:
${c.transcription || '(No transcript available)'}`
    }).join('\n\n' + '='.repeat(50) + '\n\n')

    // Compile email data
    const emailSummaries = leadEmails.length > 0 ? leadEmails.map((e, idx) => {
      const date = e.sent_at || e.created_at ? new Date(e.sent_at || e.created_at).toLocaleDateString() : 'Unknown date'
      const direction = e.is_inbound ? 'RECEIVED FROM LEAD' : 'SENT TO LEAD'
      return `=== EMAIL ${idx + 1} (${date}, ${direction}) ===
Subject: ${e.subject || '(no subject)'}
AI Summary: ${e.ai_summary || e.snippet || 'No summary available'}
Sentiment: ${e.ai_sentiment || 'Unknown'}`
    }).join('\n\n') : 'No email history available'

    const totalCallMinutes = allCalls.reduce((sum, c) => sum + Math.round((c.duration_seconds || 0) / 60), 0)

    const profilePrompt = `You are an ELITE Gold IRA sales psychologist. Build a psychological profile of this lead.

=== LEAD INFORMATION ===
Name: ${lead.first_name} ${lead.last_name}
Email: ${lead.email || 'Unknown'}
Phone: ${lead.phone || 'Unknown'}
Status: ${lead.status || 'Unknown'}
Source: ${lead.source_type || 'Unknown'}

=== COMMUNICATION HISTORY ===
Total Calls: ${allCalls.length}
Total Talk Time: ${totalCallMinutes} minutes
Total Emails: ${leadEmails.length}

=== PREVIOUS AI PROFILE ===
${existingSummary || 'No previous summary'}

=== CALL TRANSCRIPTS ===
${callSummaries}

=== EMAIL HISTORY ===
${emailSummaries}

Respond in JSON format:
{
  "profile_summary": "3-4 sentence character sketch with specific details",
  "profile_details": {
    "demographics": { "estimated_age": "", "location": "", "occupation": "", "family_situation": "" },
    "financial_profile": { "investment_capacity": "", "current_holdings": "", "retirement_timeline": "", "financial_concerns": "" },
    "psychological_profile": { "decision_making_style": "", "trust_level": "", "primary_motivation": "", "fear_factors": [], "buying_signals": [] }
  },
  "overall_assessment": "One paragraph overall assessment",
  "evolution_notes": "What changed since last profile",
  "coaching_tips": ["5-7 specific actionable tips for closing this lead"],
  "tags": ["relevant tags like 'high-value', 'ready-to-close', 'needs-nurturing'"]
}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a legendary Gold IRA sales coach. Analyze leads and provide actionable coaching tips. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: profilePrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    })

    const profileContent = response.choices[0]?.message?.content
    if (!profileContent) {
      console.log(`  ❌ No response from AI`)
      return false
    }

    const profile: LeadProfile = JSON.parse(profileContent)

    // Update lead with AI profile
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        ai_profile_summary: profile.profile_summary,
        ai_profile_details: {
          ...profile.profile_details,
          overall_assessment: profile.overall_assessment,
          evolution_notes: profile.evolution_notes,
          call_count: allCalls.length,
          email_count: leadEmails.length,
          total_talk_time_minutes: totalCallMinutes,
        },
        ai_coaching_tips: profile.coaching_tips,
        ai_tags: profile.tags || [],
        ai_profile_updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    if (updateError) {
      console.log(`  ❌ Update error: ${updateError.message}`)
      return false
    }

    console.log(`  ✅ Profile updated with ${profile.coaching_tips?.length || 0} tips, ${profile.tags?.length || 0} tags`)
    return true
  } catch (error) {
    console.error(`  ❌ Error:`, error)
    return false
  }
}

async function reprocessAllLeads() {
  console.log('\n🔄 Re-processing lead profiles...\n')

  // Get all leads that have calls with transcriptions
  const { data: leadsWithCalls, error } = await supabase
    .from('calls')
    .select('lead_id')
    .not('lead_id', 'is', null)
    .not('transcription', 'is', null)
    .eq('is_deleted', false)

  if (error) {
    console.error('Error fetching leads:', error)
    return
  }

  // Get unique lead IDs
  const uniqueLeadIds = [...new Set(leadsWithCalls?.map(c => c.lead_id).filter(Boolean))]
  console.log(`Found ${uniqueLeadIds.length} leads with analyzed calls\n`)

  let successCount = 0
  let failCount = 0

  for (const leadId of uniqueLeadIds) {
    // Get lead name for logging
    const { data: lead } = await supabase
      .from('leads')
      .select('first_name, last_name')
      .eq('id', leadId)
      .single()

    const leadName = lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() : 'Unknown'
    console.log(`\n📋 Processing: ${leadName} (${leadId})`)

    const success = await generateLeadProfile(leadId)
    if (success) {
      successCount++
    } else {
      failCount++
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n' + '='.repeat(50))
  console.log(`✅ Successfully updated: ${successCount}`)
  console.log(`❌ Failed/Skipped: ${failCount}`)
  console.log('='.repeat(50) + '\n')
}

// Run the script
const specificLeadId = process.argv[2]
if (specificLeadId) {
  console.log('\n🔄 Re-processing specific lead:', specificLeadId)
  generateLeadProfile(specificLeadId).then(success => {
    console.log(success ? '\n✅ Done!' : '\n❌ Failed')
  })
} else {
  reprocessAllLeads()
}
