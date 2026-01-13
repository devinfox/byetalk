import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

// Lazy Twilio client - created on first use to avoid build-time errors
let twilioClient: ReturnType<typeof twilio> | null = null
function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (accountSid && authToken) {
      twilioClient = twilio(accountSid, authToken)
    }
  }
  return twilioClient
}

/**
 * GET /api/twilio/call-status
 * Returns the status of a call by callSid
 * Used to detect when a colleague has answered and joined the call
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const callSid = searchParams.get('callSid')

  if (!callSid) {
    return NextResponse.json({ error: 'Missing callSid' }, { status: 400 })
  }

  const client = getTwilioClient()
  if (!client) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  try {
    const call = await client.calls(callSid).fetch()

    return NextResponse.json({
      callSid: call.sid,
      status: call.status,
      direction: call.direction,
    })
  } catch (error) {
    console.error('[Call Status] Error fetching call:', error)
    return NextResponse.json(
      { error: 'Failed to fetch call status' },
      { status: 500 }
    )
  }
}
