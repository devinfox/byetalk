import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VoiceResponse = twilio.twiml.VoiceResponse

/**
 * POST /api/turbo/connect
 * TwiML endpoint - plays when a lead answers a turbo call
 * Finds available rep and connects, or goes to voicemail
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const callSid = formData.get('CallSid') as string
    const answeredBy = formData.get('AnsweredBy') as string | null
    const from = formData.get('From') as string

    console.log(`[Turbo Connect] CallSid: ${callSid}, AnsweredBy: ${answeredBy}`)

    // Get base URL for callbacks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
    const statusCallbackUrl = `${baseUrl}/api/turbo/webhook`

    const twiml = new VoiceResponse()

    // Check if answered by machine (voicemail)
    if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'fax') {
      console.log(`[Turbo Connect] Machine detected for ${callSid}, hanging up`)
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Find the active turbo call
    const { data: activeCall, error: findError } = await getSupabaseAdmin()
      .from('turbo_active_calls')
      .select('id, organization_id, lead_id, lead_name, lead_phone, caller_id, session_id')
      .eq('call_sid', callSid)
      .single()

    if (findError || !activeCall) {
      console.error(`[Turbo Connect] Call ${callSid} not found`)
      twiml.say({ voice: 'alice' }, 'Sorry, we are experiencing technical difficulties. Please try again later.')
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Find an available rep in turbo mode
    const { data: availableRep, error: repError } = await getSupabaseAdmin()
      .rpc('get_available_turbo_rep', {
        p_organization_id: activeCall.organization_id,
      })

    if (repError || !availableRep || availableRep.length === 0) {
      console.log(`[Turbo Connect] No available rep for call ${callSid}, going to voicemail`)

      // No rep available - go to voicemail
      twiml.say(
        { voice: 'alice' },
        'Hi, thanks for answering! All of our representatives are currently busy. Please leave a message after the beep and someone will call you back shortly.'
      )
      twiml.record({
        maxLength: 120,
        action: `${baseUrl}/api/turbo/voicemail?call_sid=${callSid}`,
        transcribe: true,
        transcribeCallback: `${baseUrl}/api/turbo/voicemail/transcription?call_sid=${callSid}`,
        playBeep: true,
      })
      twiml.say({ voice: 'alice' }, 'We did not receive your message. Goodbye.')

      // Update call status
      await getSupabaseAdmin()
        .from('turbo_active_calls')
        .update({ status: 'no_answer' }) // Treated as no-answer since no rep
        .eq('id', activeCall.id)

      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const rep = availableRep[0]
    console.log(`[Turbo Connect] Connecting ${activeCall.lead_name} to rep ${rep.client_identity}`)

    // Connect to rep's browser client immediately (no hold message for seamless experience)
    const dial = twiml.dial({
      callerId: from,
      answerOnBridge: true,
      record: 'record-from-answer-dual',
      recordingStatusCallback: statusCallbackUrl,
      recordingStatusCallbackEvent: ['completed'],
      timeout: 30,
      action: `${baseUrl}/api/turbo/connect/fallback?call_sid=${callSid}`,
    })

    dial.client({
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }, rep.client_identity)

    // Update the active call with assigned rep
    await getSupabaseAdmin()
      .from('turbo_active_calls')
      .update({
        status: 'connected',
        assigned_to: rep.user_id,
        connected_at: new Date().toISOString(),
      })
      .eq('id', activeCall.id)

    // Assign the lead to this rep (they are now the go-to person for this lead)
    await getSupabaseAdmin()
      .from('leads')
      .update({
        owner_id: rep.user_id,
        assigned_at: new Date().toISOString(),
        status: 'contacted', // Update status to show they've been contacted
      })
      .eq('id', activeCall.lead_id)

    console.log(`[Turbo Connect] Assigned lead ${activeCall.lead_id} to rep ${rep.user_id}`)

    // Create a record in the main calls table
    const { data: callRecord } = await getSupabaseAdmin()
      .from('calls')
      .insert({
        call_sid: callSid,
        direction: 'outbound',
        from_number: activeCall.caller_id, // Company's caller ID
        to_number: activeCall.lead_phone,   // Lead's phone number
        user_id: rep.user_id,
        lead_id: activeCall.lead_id,
        started_at: new Date().toISOString(),
        phone_system: 'twilio',
        phone_system_metadata: { turbo_mode: true },
      })
      .select('id')
      .single()

    if (callRecord) {
      await getSupabaseAdmin()
        .from('turbo_active_calls')
        .update({ call_id: callRecord.id })
        .eq('id', activeCall.id)
    }

    // Increment session connected count atomically
    await getSupabaseAdmin().rpc('increment_turbo_session_connected', {
      p_session_id: rep.session_id,
    })

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Turbo Connect] Error:', error)
    const twiml = new VoiceResponse()
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
