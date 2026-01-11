import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/turbo/session/start
 * Start a turbo mode session for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization (check both auth_user_id and auth_id) - use admin to bypass RLS
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
      .select('id')
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .single()

    if (existingSession) {
      return NextResponse.json({
        success: true,
        session_id: existingSession.id,
        message: 'Already in turbo mode'
      })
    }

    // Create new turbo mode session
    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .insert({
        user_id: userData.id,
        organization_id: userData.organization_id,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (sessionError) {
      console.error('[Turbo Start] Error creating session:', sessionError)
      return NextResponse.json({ error: 'Failed to start turbo mode' }, { status: 500 })
    }

    console.log(`[Turbo Start] ${userData.first_name} ${userData.last_name} entered turbo mode`)

    return NextResponse.json({
      success: true,
      session_id: session.id,
      message: 'Turbo mode activated'
    })
  } catch (error) {
    console.error('[Turbo Start] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
