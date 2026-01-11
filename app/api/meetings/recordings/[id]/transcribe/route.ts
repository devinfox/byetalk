import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getRecordingAccessLink } from '@/lib/daily'
import {
  transcribeMeetingRecording,
  analyzeMeetingTranscript,
  parseActionItemDueDate,
} from '@/lib/meeting-ai'

// POST /api/meetings/recordings/[id]/transcribe - Transcribe and analyze a recording
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the recording with meeting info
    const { data: recording, error: recordingError } = await getSupabaseAdmin()
      .from('meeting_recordings')
      .select(`
        *,
        meeting:meetings(
          id, title, host_id,
          participants:meeting_participants(
            id, user_id, name, role,
            user:users(id, first_name, last_name)
          )
        )
      `)
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Check if transcript already exists
    const { data: existingTranscript } = await getSupabaseAdmin()
      .from('meeting_transcripts')
      .select('id, status')
      .eq('recording_id', recordingId)
      .single()

    if (existingTranscript) {
      if (existingTranscript.status === 'completed') {
        return NextResponse.json({
          message: 'Transcript already exists',
          transcript_id: existingTranscript.id,
        })
      }
      if (existingTranscript.status === 'processing') {
        return NextResponse.json({
          message: 'Transcription in progress',
          transcript_id: existingTranscript.id,
        })
      }
    }

    // Get fresh audio URL
    let audioUrl = recording.download_url
    try {
      const access = await getRecordingAccessLink(recording.recording_id)
      audioUrl = access.download_link
    } catch (error) {
      console.error('Error getting recording URL:', error)
      if (!audioUrl) {
        return NextResponse.json({ error: 'Could not get recording URL' }, { status: 400 })
      }
    }

    // Create transcript record (pending)
    const { data: transcript, error: transcriptError } = await getSupabaseAdmin()
      .from('meeting_transcripts')
      .insert({
        meeting_id: recording.meeting_id,
        recording_id: recordingId,
        provider: 'assemblyai',
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (transcriptError) {
      console.error('Error creating transcript record:', transcriptError)
      return NextResponse.json({ error: 'Failed to create transcript' }, { status: 500 })
    }

    // Build participant list
    const participants = (recording.meeting?.participants || []).map((p: any) => ({
      id: p.id,
      name: p.user ? `${p.user.first_name} ${p.user.last_name}` : p.name,
      user_id: p.user_id,
      role: p.role,
    }))

    // Start transcription (this may take a while)
    const transcriptionResult = await transcribeMeetingRecording(
      audioUrl,
      participants.length || undefined
    )

    if (!transcriptionResult) {
      await getSupabaseAdmin()
        .from('meeting_transcripts')
        .update({
          status: 'failed',
          error_message: 'Transcription failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transcript.id)

      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
    }

    // Update transcript with results
    await getSupabaseAdmin()
      .from('meeting_transcripts')
      .update({
        provider_transcript_id: transcriptionResult.id,
        full_text: transcriptionResult.text,
        status: 'completed',
        confidence_score: transcriptionResult.confidence,
        duration_seconds: transcriptionResult.duration,
        word_count: transcriptionResult.wordCount,
        speaker_count: transcriptionResult.speakerCount,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transcript.id)

    // Insert utterances
    if (transcriptionResult.utterances.length > 0) {
      const utteranceInserts = transcriptionResult.utterances.map((u, index) => ({
        transcript_id: transcript.id,
        speaker_label: u.speaker,
        text: u.text,
        start_time_ms: u.start,
        end_time_ms: u.end,
        confidence: u.confidence,
        sequence_number: index,
      }))

      await getSupabaseAdmin().from('transcript_utterances').insert(utteranceInserts)
    }

    // Check if transcript has meaningful content before AI analysis
    const wordCount = transcriptionResult.wordCount || 0
    const utteranceCount = transcriptionResult.utterances.length || 0
    let actionItemsCreated = 0

    if (wordCount < 20 || utteranceCount < 2) {
      // Not enough content for meaningful analysis
      console.log(`Transcript too short for AI analysis: ${wordCount} words, ${utteranceCount} utterances`)

      await getSupabaseAdmin()
        .from('meeting_insights')
        .insert({
          transcript_id: transcript.id,
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
    } else {
      // Analyze transcript with AI
      const analysis = await analyzeMeetingTranscript(
        transcriptionResult.text,
        transcriptionResult.utterances,
        participants
      )

      if (analysis) {
        // Store insights
        const { data: insight } = await getSupabaseAdmin()
          .from('meeting_insights')
          .insert({
            transcript_id: transcript.id,
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
          .select()
          .single()

        // Auto-create tasks from action items (only if there are real action items)
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
              description: `From meeting: ${recording.meeting?.title}\n\nContext: ${item.context}`,
              assigned_to: assigneeUserId || recording.meeting?.host_id,
              due_at: dueDate?.toISOString(),
              task_type: 'action_item',
              entity_type: 'meeting_insight',
              entity_id: insight.id,
              priority: priorityMap[item.priority] || 2,
              source: 'ai_meeting_analysis',
            }
          })

          await getSupabaseAdmin().from('tasks').insert(taskInserts)
          actionItemsCreated = taskInserts.length
        }
      } else {
        // Analysis returned null (e.g., OpenAI not configured or validation failed)
        await getSupabaseAdmin()
          .from('meeting_insights')
          .insert({
            transcript_id: transcript.id,
            meeting_id: recording.meeting_id,
            summary: 'AI analysis could not be performed.',
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
      }
    }

    return NextResponse.json({
      transcript_id: transcript.id,
      status: 'completed',
      word_count: transcriptionResult.wordCount,
      speaker_count: transcriptionResult.speakerCount,
      duration_seconds: transcriptionResult.duration,
      action_items_created: actionItemsCreated,
    })
  } catch (error) {
    console.error('Error in POST /api/meetings/recordings/[id]/transcribe:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/meetings/recordings/[id]/transcribe - Get transcript status/result
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recordingId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get transcript with utterances and insights
    const { data: transcript, error } = await getSupabaseAdmin()
      .from('meeting_transcripts')
      .select(`
        *,
        utterances:transcript_utterances(
          id, speaker_label, speaker_user_id, text, start_time_ms, end_time_ms, confidence, sequence_number
        ),
        insights:meeting_insights(*)
      `)
      .eq('recording_id', recordingId)
      .single()

    if (error || !transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    // Sort utterances by sequence
    if (transcript.utterances) {
      transcript.utterances.sort((a: any, b: any) => a.sequence_number - b.sequence_number)
    }

    return NextResponse.json({ transcript })
  } catch (error) {
    console.error('Error in GET /api/meetings/recordings/[id]/transcribe:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
