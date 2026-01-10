import { SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export interface FunnelMatchResult {
  funnel_id: string
  funnel_name: string
  match_reason: string
  confidence: 'high' | 'medium' | 'low'
}

interface FunnelOption {
  id: string
  name: string
  description: string | null
  tags: string[]
}

/**
 * Use OpenAI to semantically match a call to the best email funnel.
 * This allows natural language funnel descriptions like "inbound call from interested lead"
 * to match calls based on context, not just exact tag matches.
 *
 * @param callSummary - AI-generated summary of the call
 * @param callContext - Additional context (direction, sentiment, key topics)
 * @param supabase - Supabase client
 * @returns Best matching funnel or null if no match found
 */
export async function findMatchingFunnelSemantic(
  callSummary: string,
  callContext: {
    direction: 'inbound' | 'outbound'
    sentiment: string
    keyTopics: string[]
    isNewLead: boolean
    interestLevel?: string
  },
  supabase: SupabaseClient
): Promise<FunnelMatchResult | null> {
  // Fetch all active funnels with auto_enroll_enabled
  const { data: funnels, error } = await supabase
    .from('email_funnels')
    .select('id, name, description, tags')
    .eq('status', 'active')
    .eq('is_deleted', false)
    .eq('auto_enroll_enabled', true)

  if (error) {
    console.error('Error fetching funnels for semantic matching:', error)
    return null
  }

  if (!funnels?.length) {
    console.log('No active funnels with auto_enroll_enabled found')
    return null
  }

  // Filter funnels that have a description (required for AI matching)
  const eligibleFunnels = funnels.filter(
    (f: FunnelOption) => f.description && f.description.trim().length > 0
  )

  if (eligibleFunnels.length === 0) {
    console.log('No funnels with descriptions found for AI matching')
    return null
  }

  // Build funnel options for AI - description is the PRIMARY matching criteria
  const funnelOptions = eligibleFunnels.map((f: FunnelOption, index: number) => {
    const tagsStr = f.tags?.length ? ` (Tags: ${f.tags.join(', ')})` : ''
    return `${index + 1}. "${f.name}"${tagsStr}
   Purpose: ${f.description}`
  }).join('\n\n')

  // Use OpenAI to find the best match
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `You are an AI assistant helping match phone calls to email marketing funnels for a Gold IRA investment company.

CALL INFORMATION:
- Call Direction: ${callContext.direction === 'inbound' ? 'INBOUND (they called us)' : 'OUTBOUND (we called them)'}
- Lead Type: ${callContext.isNewLead ? 'NEW LEAD (first contact)' : 'EXISTING CONTACT'}
- Call Sentiment: ${callContext.sentiment}
- Interest Level: ${callContext.interestLevel || 'not specified'}
- Topics Discussed: ${callContext.keyTopics.join(', ') || 'general inquiry'}

CALL SUMMARY:
${callSummary}

AVAILABLE EMAIL FUNNELS:
${funnelOptions}

INSTRUCTIONS:
Match this call to the most appropriate funnel based on the funnel's PURPOSE description.
The purpose describes exactly what type of lead should receive that funnel.

Key matching criteria:
1. Does the call direction (inbound/outbound) match what the funnel is designed for?
2. Is the lead type (new/existing) what the funnel expects?
3. Does the call context match the scenario described in the funnel's purpose?

Be STRICT - only match if the call genuinely fits the funnel's intended purpose.
If no funnel is a good fit, return 0.

Respond with JSON:
{
  "selected_funnel": <number 0-${eligibleFunnels.length}>,
  "reason": "<explain specifically why this call matches/doesn't match the funnel's purpose>",
  "confidence": "high" | "medium" | "low"
}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that matches phone calls to email funnels. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('No response from OpenAI for funnel matching')
      return null
    }

    const result = JSON.parse(content)
    const selectedIndex = result.selected_funnel

    if (selectedIndex === 0 || selectedIndex > eligibleFunnels.length) {
      console.log('AI determined no funnel match:', result.reason)
      return null
    }

    const matchedFunnel = eligibleFunnels[selectedIndex - 1]
    console.log('AI matched funnel:', matchedFunnel.name, 'with confidence:', result.confidence)

    return {
      funnel_id: matchedFunnel.id,
      funnel_name: matchedFunnel.name,
      match_reason: result.reason,
      confidence: result.confidence
    }
  } catch (error) {
    console.error('Error in semantic funnel matching:', error)
    return null
  }
}

/**
 * Legacy tag-based matching (kept for backwards compatibility)
 */
export interface LegacyFunnelMatchResult {
  funnel_id: string
  funnel_name: string
  match_score: number
  matched_tags: string[]
}

export async function findMatchingFunnel(
  suggestedTags: string[],
  supabase: SupabaseClient,
  minMatchScore: number = 0.3
): Promise<LegacyFunnelMatchResult | null> {
  if (!suggestedTags || suggestedTags.length === 0) {
    return null
  }

  const normalizedSuggestedTags = suggestedTags.map(tag => tag.toLowerCase().trim())

  const { data: funnels, error } = await supabase
    .from('email_funnels')
    .select('id, name, tags')
    .eq('status', 'active')
    .eq('is_deleted', false)
    .eq('auto_enroll_enabled', true)

  if (error || !funnels?.length) {
    return null
  }

  interface FunnelWithTags {
    id: string
    name: string
    tags: string[]
  }

  const funnelsWithTags = funnels.filter(
    (f: FunnelWithTags) => f.tags && Array.isArray(f.tags) && f.tags.length > 0
  )

  if (funnelsWithTags.length === 0) {
    return null
  }

  const scoredFunnels = funnelsWithTags.map((funnel: FunnelWithTags) => {
    const funnelTags = funnel.tags.map(t => t.toLowerCase().trim())
    const matchedTags = normalizedSuggestedTags.filter(suggestedTag =>
      funnelTags.some(funnelTag =>
        funnelTag === suggestedTag ||
        funnelTag.includes(suggestedTag) ||
        suggestedTag.includes(funnelTag)
      )
    )
    const matchScore = matchedTags.length / normalizedSuggestedTags.length

    return {
      funnel_id: funnel.id,
      funnel_name: funnel.name,
      match_score: matchScore,
      matched_tags: matchedTags
    }
  })

  const eligibleFunnels = scoredFunnels
    .filter(f => f.matched_tags.length > 0 && f.match_score >= minMatchScore)
    .sort((a, b) => {
      if (b.match_score !== a.match_score) {
        return b.match_score - a.match_score
      }
      return b.matched_tags.length - a.matched_tags.length
    })

  return eligibleFunnels[0] || null
}

/**
 * Example tags that can be used for funnels.
 * Users can also write natural language descriptions.
 */
export const EXAMPLE_FUNNEL_TAGS = [
  'inbound call',
  'outbound call',
  'interested lead',
  'cold lead',
  'warm lead',
  'hot lead',
  'needs education',
  'ready to invest',
  'retirement planning',
  'high value',
  'first time caller',
  'follow up needed',
  'requested info',
  'price shopper',
]

/**
 * Get example tags for UI suggestions
 */
export function getExampleTags(): string[] {
  return EXAMPLE_FUNNEL_TAGS
}
