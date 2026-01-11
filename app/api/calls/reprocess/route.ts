import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


export async function POST(request: NextRequest) {
  try {
    // Get optional callId and forceAll from request body
    const body = await request.json().catch(() => ({}))
    const { callId, forceAll } = body

    let query = getSupabaseAdmin()
      .from('calls')
      .select('id, recording_url, ai_analysis_status, transcription')
      .not('recording_url', 'is', null)
      .eq('is_deleted', false)

    if (callId) {
      // Process single call
      query = query.eq('id', callId)
    } else if (!forceAll) {
      // Process only unanalyzed calls with recordings (default behavior)
      query = query.or('ai_analysis_status.is.null,ai_analysis_status.eq.pending,ai_analysis_status.eq.failed')
    }
    // If forceAll is true, we get ALL calls with recordings

    const { data: calls, error } = await query

    if (error) {
      console.error('Error fetching calls:', error)
      return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json({ message: 'No calls to process', processed: 0 })
    }

    console.log(`Found ${calls.length} calls to process`)

    const baseUrl = (request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const results: { id: string; status: string; error?: string }[] = []

    // Process each call
    for (const call of calls) {
      try {
        // Reset call for reprocessing (clear transcription so AssemblyAI will re-diarize)
        await getSupabaseAdmin()
          .from('calls')
          .update({
            ai_analysis_status: 'processing',
            transcription: null,
            ai_tasks_generated: false,
            ai_summary: null,
            ai_sentiment: null,
            ai_sentiment_score: null,
            ai_key_topics: null,
            ai_objections: null,
            ai_action_items: null,
            ai_lead_quality_score: null,
            ai_close_probability: null,
          })
          .eq('id', call.id)

        // Trigger AI processing
        const response = await fetch(`${baseUrl}/api/calls/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.id }),
        })

        const result = await response.json()

        if (response.ok) {
          results.push({ id: call.id, status: 'success' })
          console.log(`Processed call ${call.id}:`, result)
        } else {
          results.push({ id: call.id, status: 'failed', error: result.error })
          console.error(`Failed to process call ${call.id}:`, result.error)

          // Mark as failed
          await getSupabaseAdmin()
            .from('calls')
            .update({ ai_analysis_status: 'failed' })
            .eq('id', call.id)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        results.push({ id: call.id, status: 'failed', error: errorMessage })
        console.error(`Error processing call ${call.id}:`, err)

        // Mark as failed
        await getSupabaseAdmin()
          .from('calls')
          .update({ ai_analysis_status: 'failed' })
          .eq('id', call.id)
      }
    }

    const successful = results.filter(r => r.status === 'success').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      message: `Processed ${calls.length} calls`,
      successful,
      failed,
      results,
    })
  } catch (error) {
    console.error('Reprocess error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reprocess failed' },
      { status: 500 }
    )
  }
}

// GET to check status of unprocessed calls
export async function GET() {
  try {
    const { data: unprocessed, error } = await getSupabaseAdmin()
      .from('calls')
      .select('id, recording_url, ai_analysis_status, started_at, to_number')
      .not('recording_url', 'is', null)
      .eq('is_deleted', false)
      .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending,ai_analysis_status.eq.failed')
      .order('started_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
    }

    return NextResponse.json({
      unprocessedCount: unprocessed?.length || 0,
      calls: unprocessed,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
