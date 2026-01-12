import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VoiceResponse = twilio.twiml.VoiceResponse

/**
 * POST /api/turbo/session/twiml
 * TwiML endpoint for rep to join their personal conference
 * This is called when the rep's browser connects via Twilio Device
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')

  const twiml = new VoiceResponse()

  if (!sessionId) {
    twiml.say({ voice: 'alice' }, 'Session not found. Please try again.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  try {
    // Get session info
    const { data: session, error } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .select('id, conference_name, user_id, status')
      .eq('id', sessionId)
      .single()

    if (error || !session) {
      console.error('[Turbo TwiML] Session not found:', sessionId)
      twiml.say({ voice: 'alice' }, 'Session not found. Please start turbo mode again.')
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    if (session.status !== 'active') {
      twiml.say({ voice: 'alice' }, 'Your turbo session has ended.')
      twiml.hangup()
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Get base URL for status callback
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    console.log(`[Turbo TwiML] Rep joining conference: ${session.conference_name}`)

    // Join the rep to their personal conference
    // They will wait here until a lead is connected
    const dial = twiml.dial()
    dial.conference(
      {
        startConferenceOnEnter: true,    // Conference starts when rep joins
        endConferenceOnExit: true,       // Conference ends when rep hangs up
        beep: 'false' as const,           // No beep when participants join
        waitUrl: '',                      // Silent waiting (no hold music)
        statusCallback: `${baseUrl}/api/turbo/conference/status?session_id=${sessionId}`,
        statusCallbackEvent: ['start', 'end', 'join', 'leave'],
        statusCallbackMethod: 'POST',
      },
      session.conference_name
    )

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Turbo TwiML] Error:', error)
    twiml.say({ voice: 'alice' }, 'An error occurred. Please try again.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}

// Also handle GET for Twilio
export async function GET(request: NextRequest) {
  return POST(request)
}
