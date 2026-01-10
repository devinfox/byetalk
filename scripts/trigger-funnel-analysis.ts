import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { findMatchingFunnelSemantic } from '../lib/funnel-matcher'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function triggerFunnelAnalysis() {
  const phoneNumber = '8124848364'

  // Find lead by phone number (try different formats)
  const phoneVariants = [
    phoneNumber,
    `+1${phoneNumber}`,
    `1${phoneNumber}`,
    phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'),
    phoneNumber.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3'),
  ]

  console.log('Searching for lead with phone variants:', phoneVariants)

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, phone, owner_id')
    .or(phoneVariants.map(p => `phone.eq.${p}`).join(','))
    .single()

  if (leadError || !lead) {
    console.error('Lead not found by phone, trying calls table...')

    // Try searching in calls by phone number
    const { data: calls } = await supabase
      .from('calls')
      .select('id, lead_id, from_number, to_number, ai_summary, ai_sentiment, ai_key_topics, transcription, direction, user_id')
      .or(phoneVariants.map(p => `from_number.eq.${p},to_number.eq.${p}`).join(','))
      .not('ai_summary', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)

    if (calls && calls.length > 0) {
      console.log('Found call:', calls[0].id, 'lead_id:', calls[0].lead_id)
      if (calls[0].lead_id) {
        const { data: leadFromCall } = await supabase
          .from('leads')
          .select('id, first_name, last_name, email, phone, owner_id')
          .eq('id', calls[0].lead_id)
          .single()

        if (leadFromCall) {
          console.log('Found lead from call:', leadFromCall.first_name, leadFromCall.last_name)
          await analyzeForFunnel(leadFromCall, calls[0])
          return
        }
      }
    }

    // Last resort: search by first name
    console.log('Searching by name "Zach"...')
    const { data: zachLead } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, owner_id')
      .ilike('first_name', '%zach%')
      .limit(1)
      .single()

    if (zachLead) {
      console.log('Found lead by name:', zachLead.first_name, zachLead.last_name)

      const { data: zachCalls } = await supabase
        .from('calls')
        .select('id, ai_summary, ai_sentiment, ai_key_topics, transcription, direction, user_id')
        .eq('lead_id', zachLead.id)
        .not('ai_summary', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)

      if (zachCalls && zachCalls.length > 0) {
        await analyzeForFunnel(zachLead, zachCalls[0])
        return
      }
    }

    console.log('No lead or calls found')
    return
  }

  console.log('Found lead:', lead.first_name, lead.last_name, '(ID:', lead.id, ')')

  // Get the most recent call with analysis for this lead
  const { data: calls, error: callsError } = await supabase
    .from('calls')
    .select('id, ai_summary, ai_sentiment, ai_key_topics, transcription, direction, user_id')
    .eq('lead_id', lead.id)
    .not('ai_summary', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)

  if (callsError || !calls || calls.length === 0) {
    console.error('No analyzed calls found for this lead')
    return
  }

  await analyzeForFunnel(lead, calls[0])
}

async function analyzeForFunnel(lead: any, call: any) {
  console.log('\n--- Call Analysis ---')
  console.log('Call ID:', call.id)
  console.log('Direction:', call.direction)
  console.log('Summary:', call.ai_summary ? call.ai_summary.substring(0, 300) + '...' : 'None')
  console.log('Sentiment:', call.ai_sentiment)
  console.log('Key Topics:', call.ai_key_topics)

  // Check for existing funnel enrollments
  const { data: existingEnrollments } = await supabase
    .from('email_funnel_enrollments')
    .select('id, status, funnel:email_funnels(name)')
    .eq('lead_id', lead.id)

  console.log('\n--- Existing Enrollments ---')
  if (existingEnrollments && existingEnrollments.length > 0) {
    existingEnrollments.forEach((e: any) => {
      console.log(`- ${e.funnel?.name}: ${e.status}`)
    })
  } else {
    console.log('No existing enrollments')
  }

  // Get available funnels (ALL funnels, not just active)
  const { data: funnels } = await supabase
    .from('email_funnels')
    .select('id, name, description, tags, auto_enroll_enabled, status')
    .eq('is_deleted', false)

  console.log('\n--- All Funnels in Database ---')
  if (funnels && funnels.length > 0) {
    funnels.forEach((f: any) => {
      console.log(`- ${f.name}`)
      console.log(`  Status: ${f.status}, Auto-enroll: ${f.auto_enroll_enabled}`)
      console.log(`  Description: ${f.description ? f.description.substring(0, 100) : 'None'}`)
      console.log(`  Tags: ${f.tags ? f.tags.join(', ') : 'None'}`)
    })
  } else {
    console.log('No funnels found in database!')
  }

  // Run the semantic funnel matcher
  console.log('\n--- Running Semantic Funnel Matcher ---')

  const matchResult = await findMatchingFunnelSemantic(
    call.ai_summary || '',
    {
      direction: call.direction === 'inbound' ? 'inbound' : 'outbound',
      sentiment: call.ai_sentiment || 'neutral',
      keyTopics: call.ai_key_topics || [],
      isNewLead: false,
      interestLevel: undefined
    },
    supabase
  )

  if (matchResult) {
    console.log('\n✅ FUNNEL MATCH FOUND!')
    console.log('Funnel:', matchResult.funnel_name)
    console.log('Confidence:', matchResult.confidence)
    console.log('Reason:', matchResult.match_reason)

    // Check if already enrolled in this funnel
    const alreadyEnrolled = existingEnrollments?.some(
      (e: any) => e.funnel?.name === matchResult.funnel_name && ['active', 'paused', 'pending_approval'].includes(e.status)
    )

    if (alreadyEnrolled) {
      console.log('\n⚠️ Lead is already enrolled/pending in this funnel')
    } else {
      console.log('\n🎯 Creating pending enrollment...')

      const { data: enrollment, error: enrollError } = await supabase
        .from('email_funnel_enrollments')
        .insert({
          funnel_id: matchResult.funnel_id,
          lead_id: lead.id,
          status: 'pending_approval',
          current_phase: 1,
          enrolled_at: new Date().toISOString(),
          enrolled_by: lead.owner_id || call.user_id,
          match_reason: matchResult.match_reason,
        })
        .select('id')
        .single()

      if (enrollError) {
        console.error('Error creating enrollment:', enrollError)
      } else {
        console.log('✅ Pending enrollment created! ID:', enrollment?.id)
        console.log('Check your Nimbus alerts or the Drafts tab in Email Templates.')
      }
    }
  } else {
    console.log('\n❌ No matching funnel found')
    console.log('Make sure you have active funnels with:')
    console.log('- auto_enroll_enabled = true')
    console.log('- A description that matches this type of call')
  }
}

triggerFunnelAnalysis().catch(console.error)
