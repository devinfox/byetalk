import OpenAI from 'openai'
import { AssemblyAI } from 'assemblyai'

// Lazy initialization for OpenAI
let openaiInstance: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiInstance
}

// Lazy initialization for AssemblyAI
let assemblyaiInstance: AssemblyAI | null = null
function getAssemblyAI(): AssemblyAI | null {
  if (!assemblyaiInstance && process.env.ASSEMBLYAI_API_KEY) {
    assemblyaiInstance = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY })
  }
  return assemblyaiInstance
}

export interface TranscriptUtterance {
  speaker: string
  text: string
  start: number
  end: number
  confidence: number
}

export interface TranscriptionResult {
  id: string
  text: string
  utterances: TranscriptUtterance[]
  confidence: number
  duration: number
  wordCount: number
  speakerCount: number
}

export interface ActionItem {
  text: string
  assignee_name: string | null
  assignee_user_id: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  context: string
}

export interface MeetingInsight {
  summary: string
  key_topics: string[]
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  sentiment_score: number
  action_items: ActionItem[]
  commitments: Array<{ speaker: string; text: string; context: string }>
  decisions: Array<{ text: string; made_by: string; context: string }>
  questions: Array<{ text: string; asked_by: string; answered: boolean }>
  follow_ups: Array<{ text: string; responsible_party: string; timeline: string }>
  participant_stats: Record<string, { talk_time_seconds: number; word_count: number; sentiment: string }>
}

/**
 * Transcribe a meeting recording with speaker diarization
 */
export async function transcribeMeetingRecording(
  audioUrl: string,
  speakerCount?: number
): Promise<TranscriptionResult | null> {
  const client = getAssemblyAI()
  if (!client) {
    console.error('AssemblyAI not configured')
    return null
  }

  try {
    const transcript = await client.transcripts.transcribe({
      audio_url: audioUrl,
      speaker_labels: true,
      speakers_expected: speakerCount,
      language_code: 'en',
      punctuate: true,
      format_text: true,
    })

    if (transcript.status === 'error') {
      console.error('Transcription failed:', transcript.error)
      return null
    }

    // Process utterances with speaker labels
    const utterances: TranscriptUtterance[] = (transcript.utterances || []).map((u) => ({
      speaker: u.speaker || 'Unknown',
      text: u.text,
      start: u.start,
      end: u.end,
      confidence: u.confidence,
    }))

    // Count unique speakers
    const uniqueSpeakers = new Set(utterances.map((u) => u.speaker))

    return {
      id: transcript.id,
      text: transcript.text || '',
      utterances,
      confidence: transcript.confidence || 0,
      duration: Math.floor((transcript.audio_duration || 0)),
      wordCount: transcript.words?.length || 0,
      speakerCount: uniqueSpeakers.size,
    }
  } catch (error) {
    console.error('Error transcribing recording:', error)
    return null
  }
}

/**
 * Analyze a meeting transcript to extract insights and action items
 * Returns null if transcript doesn't have meaningful content
 */
export async function analyzeMeetingTranscript(
  transcript: string,
  utterances: TranscriptUtterance[],
  participants: Array<{ name: string; user_id?: string; role?: string }>
): Promise<MeetingInsight | null> {
  const openai = getOpenAI()
  if (!openai) {
    console.error('OpenAI not configured')
    return null
  }

  // Validate transcript has meaningful content
  const cleanTranscript = transcript.trim()
  const wordCount = cleanTranscript.split(/\s+/).filter(w => w.length > 0).length

  if (wordCount < 20 || utterances.length < 2) {
    console.log(`Transcript too short for analysis: ${wordCount} words, ${utterances.length} utterances`)
    return null
  }

  // Build participant context
  const participantList = participants
    .map((p) => `- ${p.name}${p.role ? ` (${p.role})` : ''}`)
    .join('\n')

  // Build transcript with speaker labels
  const formattedTranscript = utterances
    .map((u) => `[${u.speaker}]: ${u.text}`)
    .join('\n')

  const systemPrompt = `You are an AI assistant that analyzes meeting transcripts to extract actionable insights.

Meeting Participants:
${participantList}

CRITICAL RULES - READ CAREFULLY:
1. ONLY extract information that is EXPLICITLY stated in the transcript
2. DO NOT make up, infer, or hallucinate any action items, commitments, or decisions
3. If no action items are mentioned, return an EMPTY array - do not create fake ones
4. If no commitments are made, return an EMPTY array
5. If no decisions are discussed, return an EMPTY array
6. If the transcript is unclear or just small talk, say so in the summary
7. Every action item MUST have a direct quote from the transcript as "context"

Your task is to analyze the transcript and extract ONLY what is explicitly stated:
1. A brief summary (2-3 sentences) - describe what ACTUALLY happened
2. Key topics discussed - only topics that were actually mentioned
3. Overall sentiment based on the actual tone
4. Action items ONLY if someone explicitly said they would do something
5. Commitments ONLY if someone explicitly promised something
6. Decisions ONLY if a decision was explicitly made and stated
7. Questions that were actually asked
8. Follow-up items ONLY if explicitly mentioned

When identifying action items:
- Look for explicit phrases like "I'll", "I will", "we need to", "let's", "action item", "to-do"
- The person must have clearly committed to doing something
- DO NOT create action items from general discussion or suggestions
- If in doubt, DO NOT include it

Respond in JSON format only.`

  const userPrompt = `Analyze this meeting transcript:

${formattedTranscript}

Respond with a JSON object containing:
{
  "summary": "Brief 2-3 sentence summary",
  "key_topics": ["topic1", "topic2"],
  "sentiment": "positive|neutral|negative|mixed",
  "sentiment_score": 0.0 to 1.0,
  "action_items": [
    {
      "text": "Description of action item",
      "assignee_name": "Person name or null",
      "due_date": "ISO date or relative date or null",
      "priority": "low|medium|high",
      "context": "Relevant quote from transcript"
    }
  ],
  "commitments": [
    {"speaker": "Name", "text": "What they committed to", "context": "Quote"}
  ],
  "decisions": [
    {"text": "Decision made", "made_by": "Name or 'Group'", "context": "Quote"}
  ],
  "questions": [
    {"text": "Question asked", "asked_by": "Name", "answered": true|false}
  ],
  "follow_ups": [
    {"text": "Follow-up item", "responsible_party": "Name", "timeline": "When"}
  ]
}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return null
    }

    const analysis = JSON.parse(content) as MeetingInsight

    // Calculate participant stats from utterances
    const participantStats: Record<string, { talk_time_seconds: number; word_count: number; sentiment: string }> = {}

    for (const utterance of utterances) {
      const speaker = utterance.speaker
      if (!participantStats[speaker]) {
        participantStats[speaker] = { talk_time_seconds: 0, word_count: 0, sentiment: 'neutral' }
      }
      participantStats[speaker].talk_time_seconds += (utterance.end - utterance.start) / 1000
      participantStats[speaker].word_count += utterance.text.split(/\s+/).length
    }

    analysis.participant_stats = participantStats

    return analysis
  } catch (error) {
    console.error('Error analyzing transcript:', error)
    return null
  }
}

/**
 * Match speaker labels to actual participants
 */
export function matchSpeakersToParticipants(
  utterances: TranscriptUtterance[],
  participants: Array<{ id: string; name: string; user_id?: string }>
): Map<string, { participant_id: string; user_id?: string; name: string }> {
  // This is a simplified version - in production, you'd use voice fingerprinting
  // or let users manually map speakers to participants
  const speakerMap = new Map<string, { participant_id: string; user_id?: string; name: string }>()

  // Get unique speakers
  const speakers = [...new Set(utterances.map((u) => u.speaker))]

  // Simple assignment - in production, use more sophisticated matching
  speakers.forEach((speaker, index) => {
    if (index < participants.length) {
      speakerMap.set(speaker, {
        participant_id: participants[index].id,
        user_id: participants[index].user_id,
        name: participants[index].name,
      })
    }
  })

  return speakerMap
}

/**
 * Parse natural language dates from action items
 */
export function parseActionItemDueDate(dueDateStr: string | null): Date | null {
  if (!dueDateStr) return null

  const now = new Date()
  const lower = dueDateStr.toLowerCase()

  // Handle relative dates
  if (lower.includes('today') || lower === 'eod') {
    return new Date(now.setHours(17, 0, 0, 0))
  }
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(17, 0, 0, 0)
    return tomorrow
  }
  if (lower.includes('next week')) {
    const nextWeek = new Date(now)
    nextWeek.setDate(nextWeek.getDate() + 7)
    return nextWeek
  }
  if (lower.includes('end of week') || lower.includes('by friday')) {
    const friday = new Date(now)
    friday.setDate(friday.getDate() + ((5 - friday.getDay() + 7) % 7))
    friday.setHours(17, 0, 0, 0)
    return friday
  }

  // Try parsing as ISO date
  const parsed = new Date(dueDateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }

  return null
}
