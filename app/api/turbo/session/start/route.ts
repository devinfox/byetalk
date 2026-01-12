import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/turbo/session/start
 * Start a turbo mode session for the current user
 * Returns a TwiML URL for the rep to join their personal conference
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization (check both auth_user_id and auth_id)
    let userData = null
    const { data: userByAuthUserId } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id, first_name, last_name')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user already has an active session
    const { data: existingSession } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .select('id, conference_name')
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .single()

    if (existingSession) {
      // Return existing session info
      const host = request.headers.get('host') || ''
      const protocol = host.includes('localhost') ? 'http' : 'https'
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

      return NextResponse.json({
        success: true,
        session_id: existingSession.id,
        conference_name: existingSession.conference_name,
        twiml_url: `${baseUrl}/api/turbo/session/twiml?session_id=${existingSession.id}`,
        message: 'Already in turbo mode'
      })
    }

    // Generate unique conference name
    const sessionId = crypto.randomUUID()
    const conferenceName = `turbo_${userData.id.slice(0, 8)}_${sessionId.slice(0, 8)}`

    // Create new turbo mode session
    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .insert({
        id: sessionId,
        user_id: userData.id,
        organization_id: userData.organization_id,
        status: 'active',
        started_at: new Date().toISOString(),
        conference_name: conferenceName,
      })
      .select('id, conference_name')
      .single()

    if (sessionError) {
      console.error('[Turbo Start] Error creating session:', sessionError)
      return NextResponse.json({ error: 'Failed to start turbo mode' }, { status: 500 })
    }

    console.log(`[Turbo Start] ${userData.first_name} ${userData.last_name} entered turbo mode - Conference: ${conferenceName}`)

    // Build TwiML URL for rep to join conference
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
    const twimlUrl = `${baseUrl}/api/turbo/session/twiml?session_id=${session.id}`

    return NextResponse.json({
      success: true,
      session_id: session.id,
      conference_name: session.conference_name,
      twiml_url: twimlUrl,
      message: 'Turbo mode activated - connect to join your conference'
    })
  } catch (error) {
    console.error('[Turbo Start] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
