import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VoiceResponse = twilio.twiml.VoiceResponse
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

/**
 * POST /api/turbo/lead-answered
 * TwiML endpoint called when a lead answers a turbo call
 * Atomically claims an available rep and bridges the lead to their conference
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const callSid = formData.get('CallSid') as string
  const answeredBy = formData.get('AnsweredBy') as string | null

  const twiml = new VoiceResponse()

  // Get base URL
  const host = request.headers.get('host') || ''
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

  console.log(`[Lead Answered] CallSid: ${callSid}, AnsweredBy: ${answeredBy}`)

  try {
    // Check if answered by machine (voicemail)
    if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'fax') {
      console.log(`[Lead Answered] Machine detected for ${callSid}, hanging up`)

      // Update call status
      await getSupabaseAdmin()
        .from('turbo_active_calls')
        .update({ status: 'machine', ended_at: new Date().toISOString() })
        .eq('call_sid', callSid)

      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Find this call's info
    const { data: activeCall, error: findError } = await getSupabaseAdmin()
      .from('turbo_active_calls')
      .select('id, organization_id, lead_id, lead_name, lead_phone, batch_id, caller_id')
      .eq('call_sid', callSid)
      .single()

    if (findError || !activeCall) {
      console.error(`[Lead Answered] Call ${callSid} not found`)
      twiml.say({ voice: 'alice' }, 'Sorry, we are experiencing technical difficulties.')
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // ATOMIC: Try to claim an available rep
    const { data: claimedRep, error: claimError } = await getSupabaseAdmin()
      .rpc('claim_available_turbo_rep', {
        p_organization_id: activeCall.organization_id,
        p_call_sid: callSid,
      })

    if (claimError) {
      console.error(`[Lead Answered] Error claiming rep:`, claimError)
    }

    if (!claimedRep || claimedRep.length === 0) {
      console.log(`[Lead Answered] No available rep for ${callSid}`)

      // No rep available - try brief hold then retry, or go to voicemail
      // Use <Pause> then <Redirect> to retry once
      const { data: callRecord } = await getSupabaseAdmin()
        .from('turbo_active_calls')
        .select('status')
        .eq('call_sid', callSid)
        .single()

      // Check if this is a retry (status would be 'holding')
      if (callRecord?.status === 'holding') {
        // Already retried, go to voicemail
        twiml.say(
          { voice: 'alice' },
          'Hi, thanks for answering! All of our representatives are currently busy. Please leave a message after the beep.'
        )
        twiml.record({
          maxLength: 120,
          action: `${baseUrl}/api/turbo/voicemail?call_sid=${callSid}`,
          transcribe: true,
          transcribeCallback: `${baseUrl}/api/turbo/voicemail/transcription?call_sid=${callSid}`,
          playBeep: true,
        })
        twiml.say({ voice: 'alice' }, 'Goodbye.')
        twiml.hangup()

        await getSupabaseAdmin()
          .from('turbo_active_calls')
          .update({ status: 'voicemail' })
          .eq('call_sid', callSid)
      } else {
        // First attempt - brief hold and retry
        await getSupabaseAdmin()
          .from('turbo_active_calls')
          .update({ status: 'holding' })
          .eq('call_sid', callSid)

        twiml.say({ voice: 'alice' }, 'One moment please.')
        twiml.pause({ length: 2 })
        twiml.redirect(`${baseUrl}/api/turbo/lead-answered`)
      }

      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const rep = claimedRep[0]
    console.log(`[Lead Answered] Claimed rep ${rep.user_id} for call ${callSid}, conference: ${rep.conference_name}`)

    // Mark this call as the first answer and update with conference info
    await getSupabaseAdmin()
      .from('turbo_active_calls')
      .update({
        status: 'connected',
        is_first_answer: true,
        assigned_to: rep.user_id,
        session_id: rep.session_id,
        conference_name: rep.conference_name,
        connected_at: new Date().toISOString(),
      })
      .eq('id', activeCall.id)

    // Assign the lead to this rep
    await getSupabaseAdmin()
      .from('leads')
      .update({
        owner_id: rep.user_id,
        assigned_at: new Date().toISOString(),
        status: 'contacted',
      })
      .eq('id', activeCall.lead_id)

    // Create a record in the main calls table
    await getSupabaseAdmin()
      .from('calls')
      .insert({
        call_sid: callSid,
        direction: 'outbound',
        from_number: activeCall.caller_id,
        to_number: activeCall.lead_phone,
        user_id: rep.user_id,
        lead_id: activeCall.lead_id,
        started_at: new Date().toISOString(),
        phone_system: 'twilio',
        phone_system_metadata: { turbo_mode: true, conference: rep.conference_name },
      })

    // Cancel other calls in the same batch (they haven't been answered yet or will be routed to other reps)
    // Only cancel if this is from a batch
    if (activeCall.batch_id) {
      const { data: siblingCalls } = await getSupabaseAdmin()
        .rpc('get_batch_call_sids', {
          p_batch_id: activeCall.batch_id,
          p_exclude_call_sid: callSid,
        })

      if (siblingCalls && siblingCalls.length > 0) {
        console.log(`[Lead Answered] Canceling ${siblingCalls.length} sibling calls from batch ${activeCall.batch_id}`)

        for (const sibling of siblingCalls) {
          try {
            await twilioClient.calls(sibling.call_sid).update({ status: 'canceled' })

            // Update the call record
            await getSupabaseAdmin()
              .from('turbo_active_calls')
              .update({ status: 'canceled', ended_at: new Date().toISOString() })
              .eq('call_sid', sibling.call_sid)
          } catch (cancelError) {
            // Call might have already ended or been answered
            console.log(`[Lead Answered] Could not cancel ${sibling.call_sid}:`, cancelError)
          }
        }
      }
    }

    // Bridge lead to rep's conference
    // Lead joins with startConferenceOnEnter=false so they don't start a new conference
    // if the rep has disconnected
    const dial = twiml.dial({
      record: 'record-from-answer-dual',
      recordingStatusCallback: `${baseUrl}/api/turbo/webhook`,
      recordingStatusCallbackEvent: ['completed'],
    })

    dial.conference(
      {
        startConferenceOnEnter: false,  // Don't start if rep left
        endConferenceOnExit: false,     // Lead leaving doesn't end conference
        beep: 'false' as const,          // No beep
        statusCallback: `${baseUrl}/api/turbo/conference/status?session_id=${rep.session_id}`,
        statusCallbackEvent: ['join', 'leave'],
        statusCallbackMethod: 'POST',
      },
      rep.conference_name
    )

    console.log(`[Lead Answered] Bridging ${activeCall.lead_name} to conference ${rep.conference_name}`)

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Lead Answered] Error:', error)
    twiml.say({ voice: 'alice' }, 'We are experiencing technical difficulties. Please try again later.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}

export async function GET() {
  const twiml = new VoiceResponse()
  twiml.say('This endpoint is for turbo mode calls.')
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
