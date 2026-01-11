import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const VoiceResponse = twilio.twiml.VoiceResponse

// Admin client for bypassing RLS
const supabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/turbo/connect/fallback
 * TwiML endpoint - called when dial to rep fails or times out
 * Tries to find another rep or goes to voicemail
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const callSid = searchParams.get('call_sid') || formData.get('CallSid') as string
    const dialCallStatus = formData.get('DialCallStatus') as string

    console.log(`[Turbo Connect Fallback] CallSid: ${callSid}, DialCallStatus: ${dialCallStatus}`)

    // Get base URL for callbacks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    const twiml = new VoiceResponse()

    // Find the active turbo call
    const { data: activeCall, error: findError } = await supabase
      .from('turbo_active_calls')
      .select('id, organization_id, lead_id, lead_name, session_id')
      .eq('call_sid', callSid)
      .single()

    if (findError || !activeCall) {
      console.error(`[Turbo Connect Fallback] Call ${callSid} not found`)
      twiml.say({ voice: 'alice' }, 'Thank you for your time. Goodbye.')
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // If dial failed/no-answer, try to find another rep
    if (dialCallStatus === 'no-answer' || dialCallStatus === 'busy' || dialCallStatus === 'failed') {
      // Try to find another available rep
      const { data: availableRep, error: repError } = await supabase
        .rpc('get_available_turbo_rep', {
          p_organization_id: activeCall.organization_id,
        })

      if (!repError && availableRep && availableRep.length > 0) {
        const rep = availableRep[0]
        console.log(`[Turbo Connect Fallback] Found another rep ${rep.client_identity} for ${callSid}`)

        twiml.say({ voice: 'alice' }, 'One moment, connecting you now.')

        const dial = twiml.dial({
          answerOnBridge: true,
          timeout: 20,
          action: `${baseUrl}/api/turbo/connect/final-fallback?call_sid=${callSid}`,
        })

        dial.client(rep.client_identity)

        // Update assigned rep
        await supabase
          .from('turbo_active_calls')
          .update({
            assigned_to: rep.user_id,
            status: 'connected',
            connected_at: new Date().toISOString(),
          })
          .eq('id', activeCall.id)

        // Assign the lead to this rep
        await supabase
          .from('leads')
          .update({
            owner_id: rep.user_id,
            assigned_at: new Date().toISOString(),
            status: 'contacted',
          })
          .eq('id', activeCall.lead_id)

        console.log(`[Turbo Connect Fallback] Assigned lead ${activeCall.lead_id} to rep ${rep.user_id}`)

        return new NextResponse(twiml.toString(), {
          headers: { 'Content-Type': 'text/xml' },
        })
      }
    }

    // No other rep available or call was answered then hung up - go to voicemail
    console.log(`[Turbo Connect Fallback] No backup rep, going to voicemail for ${callSid}`)

    twiml.say(
      { voice: 'alice' },
      'All of our representatives are currently unavailable. Please leave a message after the beep.'
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

    // Update call status
    await supabase
      .from('turbo_active_calls')
      .update({ status: 'no_answer' })
      .eq('id', activeCall.id)

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Turbo Connect Fallback] Error:', error)
    const twiml = new VoiceResponse()
    twiml.say({ voice: 'alice' }, 'We apologize for the inconvenience. Goodbye.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
