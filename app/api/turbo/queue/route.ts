import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/turbo/queue
 * Get current queue status, active sessions, and active calls
 */
export async function GET(request: NextRequest) {
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
      .select('id, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const orgId = userData.organization_id

    // Get queue items with lead info (use admin client to bypass RLS)
    const { data: queueItems, error: queueError } = await getSupabaseAdmin()
      .from('turbo_call_queue')
      .select(`
        id,
        lead_id,
        priority,
        status,
        attempts,
        added_at,
        leads:lead_id (
          id,
          first_name,
          last_name,
          phone,
          status
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .order('added_at', { ascending: true })
      .limit(50)

    // Get active turbo sessions (reps in turbo mode)
    const { data: activeSessions, error: sessionsError } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .select(`
        id,
        user_id,
        status,
        started_at,
        calls_made,
        calls_connected,
        conference_name,
        conference_sid,
        users:user_id (
          id,
          first_name,
          last_name
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'active')

    // Get active calls
    const { data: activeCalls, error: callsError } = await getSupabaseAdmin()
      .from('turbo_active_calls')
      .select(`
        id,
        call_sid,
        lead_id,
        lead_phone,
        lead_name,
        status,
        assigned_to,
        dialed_at,
        answered_at,
        connected_at
      `)
      .eq('organization_id', orgId)
      .in('status', ['dialing', 'ringing', 'answered', 'connected'])
      .order('dialed_at', { ascending: false })

    // Get queue count
    const { count: queueCount } = await getSupabaseAdmin()
      .from('turbo_call_queue')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'queued')

    // Check if current user has active session
    const mySession = activeSessions?.find(s => s.user_id === userData.id)

    console.log('[Turbo Queue GET] User:', userData.id, 'Org:', orgId, 'Queue items:', queueItems?.length, 'Queue count:', queueCount)

    return NextResponse.json({
      queue: {
        items: queueItems || [],
        total: queueCount || 0,
      },
      sessions: {
        active: activeSessions || [],
        count: activeSessions?.length || 0,
        my_session: mySession || null,
      },
      active_calls: activeCalls || [],
      user_id: userData.id,
    })
  } catch (error) {
    console.error('[Turbo Queue] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/turbo/queue
 * Remove leads from the queue
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const leadId = searchParams.get('lead_id')
    const clearAll = searchParams.get('clear_all') === 'true'

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization (check both auth_user_id and auth_id) - use admin to bypass RLS
    let userData = null
    const { data: userByAuthUserId } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (clearAll) {
      // Clear entire queue for org
      const { error } = await getSupabaseAdmin()
        .from('turbo_call_queue')
        .delete()
        .eq('organization_id', userData.organization_id)
        .eq('status', 'queued')

      if (error) {
        return NextResponse.json({ error: 'Failed to clear queue' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Queue cleared' })
    }

    if (leadId) {
      // Remove specific lead
      const { error } = await getSupabaseAdmin()
        .from('turbo_call_queue')
        .delete()
        .eq('organization_id', userData.organization_id)
        .eq('lead_id', leadId)

      if (error) {
        return NextResponse.json({ error: 'Failed to remove lead' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Lead removed from queue' })
    }

    return NextResponse.json({ error: 'Provide lead_id or clear_all=true' }, { status: 400 })
  } catch (error) {
    console.error('[Turbo Queue] Delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
