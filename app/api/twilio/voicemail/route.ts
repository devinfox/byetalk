import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const VoiceResponse = twilio.twiml.VoiceResponse

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const callSid = formData.get('CallSid') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingSid = formData.get('RecordingSid') as string
    const recordingDuration = formData.get('RecordingDuration') as string
    const from = formData.get('From') as string

    console.log('[Voicemail] Recording received:', {
      callSid,
      recordingUrl,
      recordingSid,
      recordingDuration,
      from,
    })

    // Update the call record with voicemail info
    if (callSid && recordingUrl) {
      const { error } = await supabase
        .from('calls')
        .update({
          recording_url: recordingUrl,
          disposition: 'voicemail',
          updated_at: new Date().toISOString(),
        })
        .eq('call_sid', callSid)

      if (error) {
        console.error('[Voicemail] Failed to update call:', error)
      }
    }

    // Return TwiML to end the call
    const twiml = new VoiceResponse()
    twiml.say({ voice: 'alice' }, 'Thank you for your message. Goodbye.')
    twiml.hangup()

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Voicemail] Error:', error)
    const twiml = new VoiceResponse()
    twiml.hangup()

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
