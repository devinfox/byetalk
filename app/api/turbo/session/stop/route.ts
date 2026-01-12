import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/turbo/session/stop
 * End the current user's turbo mode session
 */
export async function POST(request: NextRequest) {
  console.log(`[Turbo Stop] ========================================`)
  console.log(`[Turbo Stop] Stop request received at ${new Date().toISOString()}`)
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's info (check both auth_user_id and auth_id) - use admin to bypass RLS
    let userData = null
    const { data: userByAuthUserId } = await getSupabaseAdmin()
      .from('users')
      .select('id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await getSupabaseAdmin()
        .from('users')
        .select('id, first_name, last_name')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find and end active session
    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .select('id, calls_made, calls_connected')
      .single()

    if (sessionError) {
      // No active session found is OK
      if (sessionError.code === 'PGRST116') {
        return NextResponse.json({
          success: true,
          message: 'No active turbo session'
        })
      }
      console.error('[Turbo Stop] Error ending session:', sessionError)
      return NextResponse.json({ error: 'Failed to stop turbo mode' }, { status: 500 })
    }

    // Cancel any active calls assigned to this user (that aren't connected)
    await getSupabaseAdmin()
      .from('turbo_active_calls')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('assigned_to', userData.id)
      .in('status', ['dialing', 'ringing', 'answered'])

    console.log(`[Turbo Stop] ${userData.first_name} ${userData.last_name} exited turbo mode. Calls: ${session?.calls_made || 0} made, ${session?.calls_connected || 0} connected`)

    return NextResponse.json({
      success: true,
      session_id: session?.id,
      stats: {
        calls_made: session?.calls_made || 0,
        calls_connected: session?.calls_connected || 0,
      },
      message: 'Turbo mode deactivated'
    })
  } catch (error) {
    console.error('[Turbo Stop] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
