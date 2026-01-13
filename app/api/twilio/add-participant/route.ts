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
 * SILENT TRANSFER - No voice messages, seamless transition
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
    let conferenceName = `conf_${callSid}_${Date.now()}` // Unique conference name
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
      // Regular call - need to move both call legs to a conference
      console.log('[Add Participant] Analyzing call structure for:', callSid)

      // Get info about the current call
      let currentCall
      try {
        currentCall = await twilioClient.calls(callSid).fetch()
      } catch (fetchError) {
        console.error('[Add Participant] Error fetching call:', fetchError)
        return NextResponse.json(
          { error: 'Call not found or has ended' },
          { status: 404 }
        )
      }

      console.log('[Add Participant] Call info:', {
        callSid,
        parentCallSid: currentCall.parentCallSid,
        direction: currentCall.direction,
        status: currentCall.status,
        from: currentCall.from,
        to: currentCall.to,
      })

      // Check if call is still active
      if (currentCall.status !== 'in-progress') {
        return NextResponse.json(
          { error: `Call is not in-progress. Status: ${currentCall.status}` },
          { status: 400 }
        )
      }

      // SILENT TwiML for joining conference (no voice messages)
      const silentConferenceTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="false"
    >${conferenceName}</Conference>
  </Dial>
</Response>`

      // Find all call legs and redirect them to the conference
      let callsToRedirect: string[] = []

      // Check for child calls (OUTBOUND scenario - browser is parent, lead is child)
      const childCalls = await twilioClient.calls.list({
        parentCallSid: callSid,
        status: 'in-progress',
      })

      if (childCalls.length > 0) {
        // Outbound call - browser call has children
        callsToRedirect = [childCalls[0].sid, callSid] // Lead first, then browser
        console.log('[Add Participant] Outbound call detected. Lead:', childCalls[0].sid, 'Browser:', callSid)
      } else if (currentCall.parentCallSid) {
        // Inbound call - browser is child of incoming call
        // Check if parent call is still active
        try {
          const parentCall = await twilioClient.calls(currentCall.parentCallSid).fetch()
          if (parentCall.status === 'in-progress') {
            callsToRedirect = [currentCall.parentCallSid, callSid] // Lead (parent) first, then browser
            console.log('[Add Participant] Inbound call detected. Lead:', currentCall.parentCallSid, 'Browser:', callSid)
          } else {
            // Parent not in progress, just redirect the browser
            callsToRedirect = [callSid]
            console.log('[Add Participant] Inbound call - parent not active, redirecting browser only')
          }
        } catch (parentError) {
          console.error('[Add Participant] Error fetching parent call:', parentError)
          callsToRedirect = [callSid]
        }
      } else {
        // No parent or children - might be a direct client call
        callsToRedirect = [callSid]
        console.log('[Add Participant] Direct call - redirecting single call')
      }

      // Redirect all calls to the conference
      for (const sid of callsToRedirect) {
        try {
          console.log('[Add Participant] Redirecting call to conference:', sid)
          await twilioClient.calls(sid).update({
            twiml: silentConferenceTwiml,
          })
          // Small delay between redirects for stability
          await new Promise(resolve => setTimeout(resolve, 200))
        } catch (redirectError: unknown) {
          const error = redirectError as { message?: string; code?: number }
          console.error('[Add Participant] Error redirecting call', sid, ':', error.message || error)
          // Continue with other calls even if one fails
        }
      }

      // Wait a moment for redirects to process
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Call the colleague to join the conference (SILENT - no announcement)
    const colleagueTwimlUrl = `${baseUrl}/api/twilio/join-conference?conference=${encodeURIComponent(conferenceName)}`

    console.log('[Add Participant] Calling colleague:', clientIdentity, 'TwiML URL:', colleagueTwimlUrl)

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
