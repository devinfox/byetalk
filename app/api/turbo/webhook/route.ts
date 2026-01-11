import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin client for bypassing RLS
const supabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/turbo/webhook
 * Handle Twilio status callbacks for turbo calls
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const answeredBy = formData.get('AnsweredBy') as string | null
    const duration = formData.get('CallDuration') as string | null
    const recordingUrl = formData.get('RecordingUrl') as string | null

    console.log(`[Turbo Webhook] CallSid: ${callSid}, Status: ${callStatus}, AnsweredBy: ${answeredBy}`)

    if (!callSid) {
      return new NextResponse('OK', { status: 200 })
    }

    // Find the active turbo call
    const { data: activeCall, error: findError } = await supabase
      .from('turbo_active_calls')
      .select('id, queue_item_id, organization_id, session_id, status')
      .eq('call_sid', callSid)
      .single()

    if (findError || !activeCall) {
      console.log(`[Turbo Webhook] Call ${callSid} not found in turbo_active_calls`)
      return new NextResponse('OK', { status: 200 })
    }

    // Map Twilio status to our status
    let newStatus: string = activeCall.status
    const updates: Record<string, unknown> = {}

    switch (callStatus) {
      case 'initiated':
        newStatus = 'dialing'
        break

      case 'ringing':
        newStatus = 'ringing'
        updates.ringing_at = new Date().toISOString()
        break

      case 'in-progress':
        // Call was answered
        newStatus = 'answered'
        updates.answered_at = new Date().toISOString()

        // Check if it was answered by machine (voicemail)
        if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep') {
          console.log(`[Turbo Webhook] Call ${callSid} answered by machine`)
          // Let the connect endpoint handle this
        }
        break

      case 'completed':
        newStatus = 'completed'
        updates.ended_at = new Date().toISOString()
        if (duration) {
          // Duration is in seconds
        }
        if (recordingUrl) {
          updates.recording_url = recordingUrl
        }
        break

      case 'busy':
        newStatus = 'busy'
        updates.ended_at = new Date().toISOString()
        break

      case 'no-answer':
        newStatus = 'no_answer'
        updates.ended_at = new Date().toISOString()
        break

      case 'failed':
      case 'canceled':
        newStatus = 'failed'
        updates.ended_at = new Date().toISOString()
        break
    }

    // Update the active call record
    updates.status = newStatus
    await supabase
      .from('turbo_active_calls')
      .update(updates)
      .eq('id', activeCall.id)

    // Update queue item status
    if (['completed', 'busy', 'no_answer', 'failed'].includes(newStatus)) {
      await supabase
        .from('turbo_call_queue')
        .update({
          status: newStatus,
          last_disposition: callStatus,
        })
        .eq('id', activeCall.queue_item_id)

      // If call was connected (has duration > 0), increment session stats
      if (newStatus === 'completed' && duration && parseInt(duration) > 0) {
        try {
          await supabase.rpc('increment_turbo_session_connected', {
            p_session_id: activeCall.session_id,
          })
        } catch {
          // Function might not exist yet, that's OK
        }
      }
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Turbo Webhook] Error:', error)
    return new NextResponse('OK', { status: 200 }) // Always return 200 to Twilio
  }
}

export async function GET() {
  return new NextResponse('Turbo webhook endpoint', { status: 200 })
}
