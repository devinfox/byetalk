import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const VoiceResponse = twilio.twiml.VoiceResponse

/**
 * POST /api/twilio/join-conference
 * TwiML endpoint for joining a conference call
 * SILENT - No voice announcements
 *
 * Query: ?conference=<conference_name>
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const conferenceName = searchParams.get('conference')

  const twiml = new VoiceResponse()

  if (!conferenceName) {
    // Only speak if there's an error
    twiml.say({ voice: 'alice' }, 'Unable to join the call.')
    twiml.hangup()
  } else {
    // SILENT join - no announcement, no hold music
    const dial = twiml.dial()
    dial.conference(
      {
        beep: 'false', // No beep when joining
        startConferenceOnEnter: true,
        endConferenceOnExit: false,
        waitUrl: '', // No hold music - immediate silent connection
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
