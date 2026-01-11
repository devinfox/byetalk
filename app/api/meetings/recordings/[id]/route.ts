import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getRecordingAccessLink, deleteRecording as deleteDailyRecording } from '@/lib/daily'

// Admin client for operations that bypass RLS
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/meetings/recordings/[id] - Get recording with fresh playback link
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the recording
    const { data: recording, error } = await supabaseAdmin
      .from('meeting_recordings')
      .select(`
        *,
        meeting:meetings(
          id, title, scheduled_at, host_id, organization_id,
          host:users!host_id(id, first_name, last_name)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Get fresh access link from Daily.co
    let playbackUrl = recording.playback_url
    try {
      const access = await getRecordingAccessLink(recording.recording_id)
      playbackUrl = access.download_link

      // Update the stored URL
      await supabaseAdmin
        .from('meeting_recordings')
        .update({
          playback_url: playbackUrl,
          download_url: playbackUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
    } catch (accessError) {
      console.error('Error getting fresh access link:', accessError)
      // Use cached URL if available
    }

    return NextResponse.json({
      recording: {
        ...recording,
        playback_url: playbackUrl,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/meetings/recordings/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/meetings/recordings/[id] - Delete a recording
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user
    let crmUser = null
    const { data: userByAuthUserId } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      crmUser = userByAuthUserId
    } else {
      const { data: userByAuthId } = await supabase
        .from('users')
        .select('id, role')
        .eq('auth_id', user.id)
        .single()
      crmUser = userByAuthId
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get the recording with meeting info
    const { data: recording, error } = await supabaseAdmin
      .from('meeting_recordings')
      .select(`
        *,
        meeting:meetings(id, host_id)
      `)
      .eq('id', id)
      .single()

    if (error || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Check authorization - only host or admin can delete
    const isAdmin = ['admin', 'super_admin'].includes(crmUser.role)
    const isHost = recording.meeting?.host_id === crmUser.id

    if (!isAdmin && !isHost) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete from Daily.co
    try {
      await deleteDailyRecording(recording.recording_id)
    } catch (dailyError) {
      console.error('Error deleting from Daily.co:', dailyError)
      // Continue to delete from database even if Daily.co deletion fails
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from('meeting_recordings')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting recording:', deleteError)
      return NextResponse.json({ error: 'Failed to delete recording' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/meetings/recordings/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
