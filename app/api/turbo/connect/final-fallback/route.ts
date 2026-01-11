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
 * POST /api/turbo/connect/final-fallback
 * TwiML endpoint - called when second dial attempt fails
 * Goes directly to voicemail
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const callSid = searchParams.get('call_sid') || formData.get('CallSid') as string
    const dialCallStatus = formData.get('DialCallStatus') as string

    console.log(`[Turbo Connect Final Fallback] CallSid: ${callSid}, DialCallStatus: ${dialCallStatus}`)

    // Get base URL for callbacks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    const twiml = new VoiceResponse()

    // If call was answered and completed normally, just end
    if (dialCallStatus === 'completed') {
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Otherwise go to voicemail
    twiml.say(
      { voice: 'alice' },
      'Sorry, all representatives are busy. Please leave a message after the beep.'
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
      .eq('call_sid', callSid)

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Turbo Connect Final Fallback] Error:', error)
    const twiml = new VoiceResponse()
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
