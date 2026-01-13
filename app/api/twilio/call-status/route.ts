import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken = process.env.TWILIO_AUTH_TOKEN!
const twilioClient = twilio(accountSid, authToken)

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

  try {
    const call = await twilioClient.calls(callSid).fetch()

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
