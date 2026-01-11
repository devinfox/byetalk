import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/twilio/active-call
 * Returns the CallSid for the user's most recent active outbound call
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
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find the most recent active outbound call for this user
    // (started within the last 30 minutes and has a call_sid)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: call, error } = await getSupabaseAdmin()
      .from('calls')
      .select('id, call_sid, to_number, started_at')
      .eq('user_id', currentUser.id)
      .eq('direction', 'outbound')
      .not('call_sid', 'is', null)
      .gte('started_at', thirtyMinutesAgo)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !call) {
      return NextResponse.json({ callSid: null })
    }

    return NextResponse.json({
      callSid: call.call_sid,
      toNumber: call.to_number,
      startedAt: call.started_at,
    })
  } catch (error) {
    console.error('[Active Call] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to get active call' },
      { status: 500 }
    )
  }
}
