import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

const accountSid = process.env.TWILIO_ACCOUNT_SID!
const authToken = process.env.TWILIO_AUTH_TOKEN!
const twilioClient = twilio(accountSid, authToken)

/**
 * POST /api/twilio/add-participant
 * Adds a colleague to an existing call by creating a conference
 *
 * Body: { callSid: string, colleagueId: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { callSid, colleagueId } = await request.json()

    if (!callSid || !colleagueId) {
      return NextResponse.json(
        { error: 'Missing callSid or colleagueId' },
        { status: 400 }
      )
    }

    // Get colleague info
    const { data: colleague, error: colleagueError } = await getSupabaseAdmin()
      .from('users')
      .select('id, first_name, last_name, extension')
      .eq('id', colleagueId)
      .eq('is_active', true)
      .single()

    if (colleagueError || !colleague) {
      return NextResponse.json(
        { error: 'Colleague not found' },
        { status: 404 }
      )
    }

    // Get base URL for TwiML
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
    const baseUrl = envUrl.replace(/\/$/, '')

    // Create a unique conference name based on the original call
    const conferenceName = `conf_${callSid}`

    // First, update the current call to join a conference
    // This uses TwiML to redirect the existing call to a conference
    const currentCallTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Adding a colleague to the call. Please hold.</Say>
  <Dial>
    <Conference
      beep="true"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
      waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
    >${conferenceName}</Conference>
  </Dial>
</Response>`

    // Update the existing call to join the conference
    await twilioClient.calls(callSid).update({
      twiml: currentCallTwiml,
    })

    // Build the client identity for the colleague
    const clientIdentity = `${colleague.first_name}_${colleague.last_name}_${colleague.id.slice(0, 8)}`

    // Create TwiML for the colleague's call
    const colleagueTwimlUrl = `${baseUrl}/api/twilio/join-conference?conference=${encodeURIComponent(conferenceName)}`

    // Make an outbound call to the colleague's Twilio Client
    const colleagueCall = await twilioClient.calls.create({
      to: `client:${clientIdentity}`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: colleagueTwimlUrl,
      statusCallback: `${baseUrl}/api/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    })

    console.log('[Add Participant] Called colleague:', {
      colleagueId: colleague.id,
      clientIdentity,
      callSid: colleagueCall.sid,
      conferenceName,
    })

    return NextResponse.json({
      success: true,
      conferenceName,
      colleagueCallSid: colleagueCall.sid,
      colleague: {
        id: colleague.id,
        name: `${colleague.first_name} ${colleague.last_name}`,
        extension: colleague.extension,
      },
    })
  } catch (error) {
    console.error('[Add Participant] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to add participant' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/twilio/add-participant
 * Returns list of available colleagues to add to a call
 */
export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's profile
    const { data: currentUser } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get all active colleagues in the same organization (excluding current user)
    const { data: colleagues, error } = await getSupabaseAdmin()
      .from('users')
      .select('id, first_name, last_name, extension, email')
      .eq('organization_id', currentUser.organization_id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .neq('id', currentUser.id)
      .order('first_name')

    if (error) {
      console.error('[Add Participant] Error fetching colleagues:', error)
      return NextResponse.json({ error: 'Failed to fetch colleagues' }, { status: 500 })
    }

    return NextResponse.json({ colleagues: colleagues || [] })
  } catch (error) {
    console.error('[Add Participant] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch colleagues' },
      { status: 500 }
    )
  }
}
