import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VoiceResponse = twilio.twiml.VoiceResponse


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const dialCallStatus = formData.get('DialCallStatus') as string
    const callSid = formData.get('CallSid') as string
    const from = formData.get('From') as string

    console.log('[Twilio Fallback] Call fallback:', { dialCallStatus, callSid, from })

    // Get the base URL for callbacks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
    const baseUrl = envUrl.replace(/\/$/, '')

    const twiml = new VoiceResponse()

    // Update call record with missed status
    if (callSid) {
      await getSupabaseAdmin()
        .from('calls')
        .update({
          disposition: dialCallStatus === 'completed' ? 'answered' : 'no_answer',
          ended_at: new Date().toISOString(),
        })
        .eq('call_sid', callSid)
    }

    // Check if this is an outbound call (from a browser client)
    const isOutboundCall = from?.startsWith('client:')

    // If call wasn't answered, offer voicemail (only for inbound calls)
    if (dialCallStatus !== 'completed' && dialCallStatus !== 'answered') {
      if (isOutboundCall) {
        // For outbound calls, just hang up - the person being called didn't answer
        console.log('[Twilio Fallback] Outbound call not answered, hanging up')
        twiml.hangup()
      } else {
        // For inbound calls, offer voicemail
        twiml.say(
          { voice: 'alice' },
          'Sorry, no one is available to take your call right now. Please leave a message after the beep, or press any key to skip.'
        )
        twiml.record({
          maxLength: 120,
          action: `${baseUrl}/api/twilio/voicemail`,
          transcribe: true,
          transcribeCallback: `${baseUrl}/api/twilio/voicemail/transcription`,
          playBeep: true,
        })
        twiml.say({ voice: 'alice' }, 'We did not receive a recording. Goodbye.')
      }
    }

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  } catch (error) {
    console.error('[Twilio Fallback] Error:', error)
    const twiml = new VoiceResponse()
    twiml.say('An error occurred. Goodbye.')
    twiml.hangup()

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }
}
