import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

/**
 * POST /api/twilio/join-conference
 * TwiML endpoint for joining a conference call
 *
 * Query: ?conference=<conference_name>
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const conferenceName = searchParams.get('conference')

  const twiml = new VoiceResponse()

  if (!conferenceName) {
    twiml.say({ voice: 'alice' }, 'Unable to join the call. Conference not found.')
    twiml.hangup()
  } else {
    twiml.say({ voice: 'alice' }, 'Joining the call now.')

    const dial = twiml.dial()
    dial.conference(
      {
        beep: 'true',
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
      },
      conferenceName
    )
  }

  return new NextResponse(twiml.toString(), {
    headers: {
      'Content-Type': 'text/xml',
    },
  })
}

/**
 * GET handler for Twilio's GET requests
 */
export async function GET(request: NextRequest) {
  return POST(request)
}
