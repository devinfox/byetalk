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
 * Handles both regular calls and turbo mode calls
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

    // Get current user info - check both auth_id and auth_user_id
    let currentUser = null
    const { data: userByAuthId } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (userByAuthId) {
      currentUser = userByAuthId
    } else {
      const { data: userByAuthUserId } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id')
        .eq('auth_user_id', user.id)
        .single()
      currentUser = userByAuthUserId
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

    // Check if this user has an active turbo mode session with a conference
    let conferenceName = `conf_${callSid}` // Default for regular calls
    let isTurboMode = false

    if (currentUser) {
      const { data: turboSession } = await getSupabaseAdmin()
        .from('turbo_mode_sessions')
        .select('id, conference_name, current_call_sid')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .not('conference_name', 'is', null)
        .single()

      if (turboSession?.conference_name) {
        // User is in turbo mode - use their existing conference
        conferenceName = turboSession.conference_name
        isTurboMode = true
        console.log('[Add Participant] Using turbo mode conference:', conferenceName)
      }
    }

    // Build the client identity for the colleague
    const clientIdentity = `${colleague.first_name}_${colleague.last_name}_${colleague.id.slice(0, 8)}`

    if (!isTurboMode) {
      // Regular call - need to move BOTH call legs to a conference
      // The callSid is the parent (browser) call, we need to find the child (lead) call

      console.log('[Add Participant] Finding child calls for parent:', callSid)

      // Get all child calls (the outbound leg to the lead)
      const childCalls = await twilioClient.calls.list({
        parentCallSid: callSid,
        status: 'in-progress',
      })

      console.log('[Add Participant] Found child calls:', childCalls.map(c => ({ sid: c.sid, to: c.to, status: c.status })))

      // TwiML to join conference (for lead)
      const leadConferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we add another person to the call.</Say>
  <Dial>
    <Conference
      beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
      waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
    >${conferenceName}</Conference>
  </Dial>
</Response>`

      // TwiML for rep (browser) to join conference
      const repConferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Adding a colleague to the call.</Say>
  <Dial>
    <Conference
      beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
    >${conferenceName}</Conference>
  </Dial>
</Response>`

      // First, update the child call (lead) to join the conference
      // This must happen BEFORE we update the parent, otherwise the child gets disconnected
      for (const childCall of childCalls) {
        try {
          console.log('[Add Participant] Updating child call to conference:', childCall.sid)
          await twilioClient.calls(childCall.sid).update({
            twiml: leadConferenceTwiml,
          })
        } catch (err) {
          console.error('[Add Participant] Error updating child call:', err)
        }
      }

      // Small delay to ensure child call update processes
      await new Promise(resolve => setTimeout(resolve, 500))

      // Then update the parent call (rep's browser) to join the conference
      console.log('[Add Participant] Updating parent call to conference:', callSid)
      await twilioClient.calls(callSid).update({
        twiml: repConferenceTwiml,
      })
    }
    // For turbo mode, we're already in a conference - just add the colleague

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
      isTurboMode,
    })

    return NextResponse.json({
      success: true,
      conferenceName,
      colleagueCallSid: colleagueCall.sid,
      isTurboMode,
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

    // Get current user's profile - check both auth_id and auth_user_id
    let currentUser = null
    const { data: userByAuthId } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (userByAuthId) {
      currentUser = userByAuthId
    } else {
      const { data: userByAuthUserId } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id')
        .eq('auth_user_id', user.id)
        .single()
      currentUser = userByAuthUserId
    }

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

    // Set cache headers for faster subsequent loads
    return NextResponse.json(
      { colleagues: colleagues || [] },
      {
        headers: {
          'Cache-Control': 'private, max-age=60', // Cache for 60 seconds
        },
      }
    )
  } catch (error) {
    console.error('[Add Participant] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch colleagues' },
      { status: 500 }
    )
  }
}
