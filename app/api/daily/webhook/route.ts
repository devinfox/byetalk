import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  verifyWebhookSignature,
  getRecordingAccessLink,
  requestRecordingTranscript,
  getRecordingTranscript,
} from '@/lib/daily'
import {
  analyzeMeetingTranscript,
  parseActionItemDueDate,
  type TranscriptUtterance,
} from '@/lib/meeting-ai'

// Admin client for webhook operations
const supabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DailyWebhookPayload {
  version: string
  type: string
  id: string
  event_ts: number
  payload: {
    recording_id?: string
    room_name?: string
    start_ts?: number
    duration?: number
    status?: string
    share_token?: string
    s3_key?: string
    max_participants?: number
    participant_id?: string
    user_id?: string
    user_name?: string
    session_id?: string
  }
}

// POST /api/daily/webhook - Handle Daily.co webhooks
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // Handle Daily.co webhook validation request (empty or non-JSON body)
    if (!rawBody || rawBody.trim() === '' || rawBody.trim() === '{}') {
      console.log('Daily.co webhook validation request')
      return NextResponse.json({ ok: true })
    }

    const signature = request.headers.get('x-webhook-signature')

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.DAILY_WEBHOOK_SECRET
    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret)
      if (!isValid) {
        console.error('Invalid webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    let payload: DailyWebhookPayload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      // Invalid JSON - likely a validation request
      console.log('Daily.co webhook validation (non-JSON body)')
      return NextResponse.json({ ok: true })
    }
    console.log('Daily.co webhook received:', payload.type)

    switch (payload.type) {
      case 'recording.started':
        await handleRecordingStarted(payload)
        break

      case 'recording.ready-to-download':
        await handleRecordingReady(payload)
        break

      case 'recording.error':
        await handleRecordingError(payload)
        break

      case 'meeting.started':
        await handleMeetingStarted(payload)
        break

      case 'meeting.ended':
        await handleMeetingEnded(payload)
        break

      case 'participant.joined':
        await handleParticipantJoined(payload)
        break

      case 'participant.left':
        await handleParticipantLeft(payload)
        break

      case 'transcript.started':
        console.log('Transcription started for recording:', payload.payload.recording_id)
        break

      case 'transcript.ready-to-download':
        await handleTranscriptionReady(payload)
        break

      case 'transcript.error':
        console.error('Transcription error:', payload.payload)
        break

      default:
        console.log('Unhandled webhook type:', payload.type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing Daily.co webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleRecordingStarted(payload: DailyWebhookPayload) {
  const { recording_id, room_name, start_ts } = payload.payload

  if (!recording_id || !room_name) return

  // Find meeting by room name
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('daily_room_name', room_name)
    .single()

  if (!meeting) {
    console.error('Meeting not found for room:', room_name)
    return
  }

  // Create recording record
  await supabase.from('meeting_recordings').insert({
    meeting_id: meeting.id,
    recording_id,
    status: 'processing',
    started_at: start_ts ? new Date(start_ts * 1000).toISOString() : new Date().toISOString(),
  })

  console.log('Recording started for meeting:', meeting.id)
}

async function handleRecordingReady(payload: DailyWebhookPayload) {
  const { recording_id, room_name, duration, s3_key, start_ts } = payload.payload

  if (!recording_id) return

  console.log('Processing recording ready:', recording_id, 'room:', room_name)

  try {
    // Check if recording already exists
    const { data: existingRecording } = await supabase
      .from('meeting_recordings')
      .select('id')
      .eq('recording_id', recording_id)
      .single()

    let recordingDbId: string

    if (existingRecording) {
      // Update existing recording
      const { error } = await supabase
        .from('meeting_recordings')
        .update({
          status: 'ready',
          duration_seconds: duration,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('recording_id', recording_id)

      if (error) {
        console.error('Error updating recording:', error)
        return
      }
      recordingDbId = existingRecording.id
    } else {
      // Create new recording (for recordings not started through our system)
      // Find meeting by room name
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, title, host_id')
        .eq('daily_room_name', room_name)
        .single()

      // Get access link for the recording
      let accessLink = null
      try {
        const access = await getRecordingAccessLink(recording_id)
        accessLink = access.download_link
      } catch (error) {
        console.error('Error getting access link:', error)
      }

      // Insert new recording
      const { data: newRecording, error: insertError } = await supabase
        .from('meeting_recordings')
        .insert({
          meeting_id: meeting?.id || null,
          recording_id,
          room_name: room_name || null,
          status: 'ready',
          duration_seconds: duration,
          download_url: accessLink,
          playback_url: accessLink,
          storage_provider: 'daily',
          started_at: start_ts ? new Date(start_ts * 1000).toISOString() : new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError || !newRecording) {
        console.error('Error inserting recording:', insertError)
        return
      }
      recordingDbId = newRecording.id
    }

    console.log('Recording synced:', recordingDbId)

    // Request transcription from Daily.co - this is MANDATORY, not optional
    // Daily.co will send a transcript.ready-to-download webhook when complete
    // We also have enable_transcription: true on rooms, so Daily may auto-transcribe
    console.log('🎙️ Requesting transcription for recording:', recording_id)

    let transcriptionRequested = false
    let retryCount = 0
    const maxRetries = 3

    while (!transcriptionRequested && retryCount < maxRetries) {
      try {
        const transcriptRequest = await requestRecordingTranscript(recording_id)
        console.log('✅ Transcription requested successfully, transcript_id:', transcriptRequest.transcript_id)
        transcriptionRequested = true

        // Update recording to mark transcription as processing
        await supabase
          .from('meeting_recordings')
          .update({
            transcription_status: 'processing',
            updated_at: new Date().toISOString()
          })
          .eq('id', recordingDbId)
      } catch (transcriptError) {
        retryCount++
        console.error(`❌ Error requesting transcription (attempt ${retryCount}/${maxRetries}):`, transcriptError)

        if (retryCount < maxRetries) {
          // Wait before retry (exponential backoff: 1s, 2s, 4s)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)))
        } else {
          // All retries failed - mark as failed so we can retry later
          await supabase
            .from('meeting_recordings')
            .update({
              transcription_status: 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', recordingDbId)
          console.error('❌ Failed to request transcription after', maxRetries, 'attempts')
        }
      }
    }
  } catch (error) {
    console.error('Error in handleRecordingReady:', error)
  }
}

async function handleRecordingError(payload: DailyWebhookPayload) {
  const { recording_id } = payload.payload

  if (!recording_id) return

  await supabase
    .from('meeting_recordings')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('recording_id', recording_id)

  console.log('Recording failed:', recording_id)
}

async function handleMeetingStarted(payload: DailyWebhookPayload) {
  const { room_name } = payload.payload

  if (!room_name) return

  await supabase
    .from('meetings')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('daily_room_name', room_name)
    .eq('status', 'scheduled')

  console.log('Meeting started:', room_name)
}

async function handleMeetingEnded(payload: DailyWebhookPayload) {
  const { room_name, duration } = payload.payload

  if (!room_name) return

  await supabase
    .from('meetings')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      total_duration_seconds: duration || 0,
      updated_at: new Date().toISOString(),
    })
    .eq('daily_room_name', room_name)
    .eq('status', 'in_progress')

  console.log('Meeting ended:', room_name)
}

async function handleParticipantJoined(payload: DailyWebhookPayload) {
  const { room_name, user_id, user_name, session_id } = payload.payload

  if (!room_name || !user_id) return

  // Find meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, max_concurrent_participants')
    .eq('daily_room_name', room_name)
    .single()

  if (!meeting) return

  // Update participant if exists
  const isGuest = user_id.startsWith('guest-')

  if (!isGuest) {
    await supabase
      .from('meeting_participants')
      .update({
        joined_at: new Date().toISOString(),
        invite_status: 'attended',
        join_count: supabase.rpc('increment', { value: 1 }),
        updated_at: new Date().toISOString(),
      })
      .eq('meeting_id', meeting.id)
      .eq('user_id', user_id)
  }

  // Update max concurrent participants
  // Get current count from Daily.co presence would be more accurate
  // but for now we'll just increment
  await supabase.rpc('update_max_concurrent_participants', {
    meeting_id: meeting.id,
  })

  console.log('Participant joined:', user_name || user_id)
}

async function handleParticipantLeft(payload: DailyWebhookPayload) {
  const { room_name, user_id, session_id, duration } = payload.payload

  if (!room_name || !user_id) return

  // Find meeting
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('daily_room_name', room_name)
    .single()

  if (!meeting) return

  const isGuest = user_id.startsWith('guest-')

  if (!isGuest) {
    // Update participant
    await supabase
      .from('meeting_participants')
      .update({
        left_at: new Date().toISOString(),
        duration_seconds: duration || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('meeting_id', meeting.id)
      .eq('user_id', user_id)
  }

  console.log('Participant left:', user_id)
}

/**
 * Handle transcription.ready event
 * - Fetch full transcript from Daily.co with real speaker names
 * - Store in database
 * - Analyze with GPT-4o and create tasks
 */
async function handleTranscriptionReady(payload: DailyWebhookPayload) {
  const { recording_id } = payload.payload

  if (!recording_id) return

  console.log('Processing transcription ready for recording:', recording_id)

  try {
    // Get the recording from our database
    const { data: recording, error: recordingError } = await supabase
      .from('meeting_recordings')
      .select(`
        id, meeting_id, room_name, recording_id,
        meeting:meetings(id, title, host_id, participants:meeting_participants(id, user_id, name, role, user:users(id, first_name, last_name)))
      `)
      .eq('recording_id', recording_id)
      .single()

    if (recordingError || !recording) {
      console.error('Recording not found for transcription:', recording_id)
      return
    }

    // Fetch full transcript from Daily.co with speaker names
    const transcript = await getRecordingTranscript(recording_id)

    if (transcript.status !== 'completed') {
      console.log('Transcript not complete:', transcript.status, transcript.error)

      // Update recording status
      await supabase
        .from('meeting_recordings')
        .update({
          transcription_status: transcript.status === 'error' ? 'failed' : transcript.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', recording.id)
      return
    }

    console.log('Got transcript with', transcript.utterances?.length || 0, 'utterances')

    // Build participant list for AI analysis
    const meetingData = recording.meeting as any
    const participants = (meetingData?.participants || []).map((p: any) => ({
      id: p.id,
      name: p.user ? `${p.user.first_name} ${p.user.last_name}` : p.name,
      user_id: p.user_id,
      role: p.role,
    }))

    // Create transcript record
    const { data: transcriptRecord, error: transcriptError } = await supabase
      .from('meeting_transcripts')
      .insert({
        meeting_id: recording.meeting_id,
        recording_id: recording.id,
        provider: 'daily',
        provider_transcript_id: recording_id,
        full_text: transcript.text || '',
        status: 'completed',
        duration_seconds: transcript.duration,
        speaker_count: new Set((transcript.utterances || []).map(u => u.speaker_id)).size,
        word_count: transcript.text?.split(/\s+/).length || 0,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (transcriptError) {
      console.error('Error creating transcript record:', transcriptError)
      return
    }

    // Insert utterances with actual speaker names from Daily.co
    if (transcript.utterances && transcript.utterances.length > 0) {
      const utteranceInserts = transcript.utterances.map((u, index) => ({
        transcript_id: transcriptRecord.id,
        speaker_label: u.speaker_name || u.speaker_id,
        text: u.text,
        start_time_ms: u.start_ts * 1000,
        end_time_ms: u.end_ts * 1000,
        confidence: 1.0,
        sequence_number: index,
      }))

      await supabase.from('transcript_utterances').insert(utteranceInserts)
    }

    // Update recording status
    await supabase
      .from('meeting_recordings')
      .update({
        transcription_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', recording.id)

    // Check if transcript has meaningful content before AI analysis
    const transcriptText = transcript.text || ''
    const wordCount = transcriptText.trim().split(/\s+/).filter(w => w.length > 0).length
    const utteranceCount = transcript.utterances?.length || 0

    // Minimum thresholds for meaningful content
    const MIN_WORDS = 20  // At least 20 words
    const MIN_UTTERANCES = 2  // At least 2 utterances

    if (wordCount < MIN_WORDS || utteranceCount < MIN_UTTERANCES) {
      console.log(`⚠️ Transcript too short for AI analysis (${wordCount} words, ${utteranceCount} utterances). Skipping.`)

      // Store a "no content" insight instead of fake analysis
      await supabase
        .from('meeting_insights')
        .insert({
          transcript_id: transcriptRecord.id,
          meeting_id: recording.meeting_id,
          summary: 'No meaningful content to analyze. The recording was too short or contained insufficient speech.',
          key_topics: [],
          sentiment: 'neutral',
          sentiment_score: 0.5,
          action_items: [],
          commitments: [],
          decisions: [],
          questions: [],
          follow_ups: [],
          participant_stats: {},
          ai_model: 'none',
          ai_processed_at: new Date().toISOString(),
        })

      console.log('Recording processing complete (no AI analysis):', recording.id)
      return
    }

    console.log('Transcript has sufficient content, analyzing with AI...')

    // Format utterances for AI analysis
    const formattedUtterances: TranscriptUtterance[] = (transcript.utterances || []).map(u => ({
      speaker: u.speaker_name || u.speaker_id,
      text: u.text,
      start: u.start_ts * 1000,
      end: u.end_ts * 1000,
      confidence: 1.0,
    }))

    const analysis = await analyzeMeetingTranscript(
      transcriptText,
      formattedUtterances,
      participants
    )

    if (analysis) {
      console.log('AI analysis complete, creating insights and tasks...')

      // Store insights
      const { data: insight, error: insightError } = await supabase
        .from('meeting_insights')
        .insert({
          transcript_id: transcriptRecord.id,
          meeting_id: recording.meeting_id,
          summary: analysis.summary,
          key_topics: analysis.key_topics,
          sentiment: analysis.sentiment,
          sentiment_score: analysis.sentiment_score,
          action_items: analysis.action_items,
          commitments: analysis.commitments,
          decisions: analysis.decisions,
          questions: analysis.questions,
          follow_ups: analysis.follow_ups,
          participant_stats: analysis.participant_stats,
          ai_model: 'gpt-4o',
          ai_processed_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insightError) {
        console.error('Error storing insights:', insightError)
      }

      // Auto-create tasks from action items
      if (analysis.action_items.length > 0 && insight) {
        const taskInserts = analysis.action_items.map((item) => {
          // Try to match assignee to a participant
          let assigneeUserId = null
          if (item.assignee_name) {
            const matchedParticipant = participants.find((p: any) =>
              p.name.toLowerCase().includes(item.assignee_name!.toLowerCase())
            )
            if (matchedParticipant?.user_id) {
              assigneeUserId = matchedParticipant.user_id
            }
          }

          // Parse due date
          const dueDate = parseActionItemDueDate(item.due_date)

          // Map priority
          const priorityMap: Record<string, number> = { low: 1, medium: 2, high: 3 }

          return {
            title: item.text,
            description: `From meeting: ${meetingData?.title || recording.room_name}\n\nContext: ${item.context}`,
            assigned_to: assigneeUserId || meetingData?.host_id,
            due_at: dueDate?.toISOString(),
            task_type: 'action_item',
            entity_type: 'meeting_insight',
            entity_id: insight.id,
            priority: priorityMap[item.priority] || 2,
            source: 'ai_meeting_analysis',
          }
        })

        const { error: tasksError } = await supabase.from('tasks').insert(taskInserts)

        if (tasksError) {
          console.error('Error creating tasks:', tasksError)
        } else {
          console.log('Created', taskInserts.length, 'tasks from meeting')
        }
      }
    }

    console.log('Recording processing complete:', recording.id)
  } catch (error) {
    console.error('Error in handleTranscriptionReady:', error)
  }
}

// GET /api/daily/webhook - Handle validation requests
export async function GET() {
  console.log('Daily.co webhook GET validation request')
  return NextResponse.json({ ok: true })
}

// HEAD /api/daily/webhook - Handle validation requests
export async function HEAD() {
  console.log('Daily.co webhook HEAD validation request')
  return new NextResponse(null, { status: 200 })
}

// OPTIONS /api/daily/webhook - Handle CORS preflight
export async function OPTIONS() {
  console.log('Daily.co webhook OPTIONS request')
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-webhook-signature',
    },
  })
}
