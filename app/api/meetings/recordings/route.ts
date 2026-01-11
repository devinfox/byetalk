import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/meetings/recordings - List all recordings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's organization
    let crmUser = null
    const { data: userByAuthUserId } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      crmUser = userByAuthUserId
    } else {
      const { data: userByAuthId } = await supabase
        .from('users')
        .select('id, organization_id')
        .eq('auth_id', user.id)
        .single()
      crmUser = userByAuthId
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const meetingId = searchParams.get('meeting_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query for recordings
    let query = getSupabaseAdmin()
      .from('meeting_recordings')
      .select(`
        id, recording_id, room_name, status, download_url, playback_url,
        duration_seconds, started_at, created_at, thumbnail_url, transcription_status,
        meeting:meetings(
          id, title, scheduled_at, host_id,
          host:users!host_id(id, first_name, last_name)
        )
      `)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })

    // Filter by meeting if specified
    if (meetingId) {
      query = query.eq('meeting_id', meetingId)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: recordings, error } = await query

    if (error) {
      console.error('Error fetching recordings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Include all recordings - those with meetings and orphaned ones
    // For recordings with meetings, we keep the meeting info
    // For orphaned recordings (no meeting), we just show the recording itself
    const allRecordings = recordings || []

    return NextResponse.json({
      recordings: allRecordings,
      total: allRecordings.length,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error in GET /api/meetings/recordings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
