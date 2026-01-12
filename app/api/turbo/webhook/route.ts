import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
    const { data: activeCall, error: findError } = await getSupabaseAdmin()
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
    await getSupabaseAdmin()
      .from('turbo_active_calls')
      .update(updates)
      .eq('id', activeCall.id)

    // Also update the main calls table for turbo calls
    if (recordingUrl || newStatus === 'completed') {
      const mainCallUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (recordingUrl) {
        mainCallUpdates.recording_url = recordingUrl
        mainCallUpdates.ai_analysis_status = 'pending'
      }

      if (newStatus === 'completed') {
        mainCallUpdates.disposition = 'answered'
        mainCallUpdates.ended_at = new Date().toISOString()
        if (duration) {
          mainCallUpdates.duration_seconds = parseInt(duration)
        }
      }

      // Update the main calls table by call_sid
      const { error: mainCallError } = await getSupabaseAdmin()
        .from('calls')
        .update(mainCallUpdates)
        .eq('call_sid', callSid)

      if (mainCallError) {
        console.log(`[Turbo Webhook] Could not update main calls table: ${mainCallError.message}`)
      } else {
        console.log(`[Turbo Webhook] Updated main calls table for ${callSid}`)

        // Trigger AI processing if we have a recording URL
        if (recordingUrl) {
          try {
            // Get the call ID from the main calls table
            const { data: mainCall } = await getSupabaseAdmin()
              .from('calls')
              .select('id')
              .eq('call_sid', callSid)
              .single()

            if (mainCall) {
              const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
              console.log(`[Turbo Webhook] Triggering AI processing for call ${mainCall.id}`)

              // Fire and don't wait - AI processing can take a while
              fetch(`${baseUrl}/api/calls/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callId: mainCall.id }),
              }).catch(err => console.error('[Turbo Webhook] AI processing trigger failed:', err))
            }
          } catch (err) {
            console.error('[Turbo Webhook] Error triggering AI processing:', err)
          }
        }
      }
    }

    // Update queue item status
    if (['completed', 'busy', 'no_answer', 'failed'].includes(newStatus)) {
      // For completed calls, mark as completed
      // For no_answer/busy/failed, reset to queued for retry (up to 3 attempts)
      const retryableStatuses = ['busy', 'no_answer', 'failed']
      const queueStatus = retryableStatuses.includes(newStatus) ? 'queued' : newStatus

      await getSupabaseAdmin()
        .from('turbo_call_queue')
        .update({
          status: queueStatus,
          last_disposition: callStatus,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', activeCall.queue_item_id)

      // If call was connected (has duration > 0), increment session stats
      if (newStatus === 'completed' && duration && parseInt(duration) > 0) {
        try {
          await getSupabaseAdmin().rpc('increment_turbo_session_connected', {
            p_session_id: activeCall.session_id,
          })
        } catch {
          // Function might not exist yet, that's OK
        }
      }

      // IMPORTANT: Release the rep back to the pool when the call ends
      // This is a backup in case the conference participant-leave callback doesn't fire
      if (activeCall.session_id) {
        try {
          await getSupabaseAdmin().rpc('release_turbo_rep', {
            p_session_id: activeCall.session_id,
          })
          console.log(`[Turbo Webhook] Released rep from session ${activeCall.session_id} back to pool`)
        } catch (releaseErr) {
          console.error(`[Turbo Webhook] Error releasing rep:`, releaseErr)
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
