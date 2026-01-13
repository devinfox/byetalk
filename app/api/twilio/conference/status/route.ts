import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/twilio/conference/status
 * Handles conference status callbacks for inbound conference calls
 * Just logs events for now - can be extended for more functionality
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const searchParams = request.nextUrl.searchParams

    const conferenceName = searchParams.get('conf')
    const conferenceSid = formData.get('ConferenceSid') as string
    const statusCallbackEvent = formData.get('StatusCallbackEvent') as string
    const callSid = formData.get('CallSid') as string

    console.log('[Conference Status] Event:', {
      conferenceName,
      conferenceSid,
      event: statusCallbackEvent,
      callSid,
    })

    // Could add logic here to:
    // - Track when lead joins/leaves
    // - Update call records
    // - Notify frontend of conference state changes

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Conference Status] Error:', error)
    return new NextResponse('OK', { status: 200 }) // Always return 200 to Twilio
  }
}
