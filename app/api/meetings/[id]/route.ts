import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { deleteDailyRoom, updateDailyRoom } from '@/lib/daily'
import type { MeetingUpdate } from '@/types/meeting.types'

// Admin client for operations that need to bypass RLS
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/meetings/[id] - Get a single meeting
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

    const { data: meeting, error } = await supabase
      .from('meetings')
      .select(`
        *,
        host:users!host_id(id, first_name, last_name, avatar_url, email),
        participants:meeting_participants(
          id, user_id, email, name, role, invite_status, joined_at, left_at, duration_seconds,
          user:users(id, first_name, last_name, avatar_url, email)
        ),
        recordings:meeting_recordings(
          id, recording_id, status, download_url, playback_url, duration_seconds, created_at
        ),
        lead:leads(id, first_name, last_name),
        contact:contacts(id, first_name, last_name),
        deal:deals(id, name),
        task:tasks(id, title, status)
      `)
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
      }
      console.error('Error fetching meeting:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ meeting })
  } catch (error) {
    console.error('Error in GET /api/meetings/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/meetings/[id] - Update a meeting
export async function PATCH(
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

    // Get current CRM user - try both auth_user_id and auth_id for compatibility
    let crmUser = null
    const { data: userByAuthUserId } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      crmUser = userByAuthUserId
    } else {
      const { data: userByAuthId } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()
      crmUser = userByAuthId
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if meeting exists and user has permission
    const { data: existingMeeting, error: fetchError } = await supabase
      .from('meetings')
      .select('id, host_id, daily_room_name, task_id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (fetchError || !existingMeeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const body: MeetingUpdate = await request.json()

    // Update Daily.co room if needed
    if (existingMeeting.daily_room_name) {
      const roomUpdates: Record<string, unknown> = {}

      if (body.recording_enabled !== undefined) {
        roomUpdates.enable_recording = body.recording_enabled ? 'cloud' : false
      }
      if (body.screenshare_enabled !== undefined) {
        roomUpdates.enable_screenshare = body.screenshare_enabled
      }
      if (body.chat_enabled !== undefined) {
        roomUpdates.enable_chat = body.chat_enabled
      }

      if (Object.keys(roomUpdates).length > 0) {
        try {
          await updateDailyRoom(existingMeeting.daily_room_name, {
            properties: roomUpdates,
          })
        } catch (roomError) {
          console.error('Error updating Daily.co room:', roomError)
        }
      }
    }

    // Update meeting
    const { data: meeting, error: updateError } = await supabase
      .from('meetings')
      .update({
        title: body.title,
        description: body.description,
        status: body.status,
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes,
        started_at: body.started_at,
        ended_at: body.ended_at,
        is_public: body.is_public,
        max_participants: body.max_participants,
        require_approval: body.require_approval,
        recording_enabled: body.recording_enabled,
        virtual_bg_enabled: body.virtual_bg_enabled,
        chat_enabled: body.chat_enabled,
        screenshare_enabled: body.screenshare_enabled,
        noise_cancellation_enabled: body.noise_cancellation_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        host:users!host_id(id, first_name, last_name, avatar_url, email)
      `)
      .single()

    if (updateError) {
      console.error('Error updating meeting:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Update linked task if schedule changed
    if (body.scheduled_at && existingMeeting.task_id) {
      await supabase
        .from('tasks')
        .update({
          due_at: body.scheduled_at,
          title: body.title ? `Meeting: ${body.title}` : undefined,
          description: body.description,
        })
        .eq('id', existingMeeting.task_id)
    }

    return NextResponse.json({ meeting })
  } catch (error) {
    console.error('Error in PATCH /api/meetings/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/meetings/[id] - Soft delete a meeting
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

    // Get current CRM user - try both auth_user_id and auth_id for compatibility
    let crmUser = null
    const { data: userByAuthUserId2 } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId2) {
      crmUser = userByAuthUserId2
    } else {
      const { data: userByAuthId2 } = await supabase
        .from('users')
        .select('id, role')
        .eq('auth_id', user.id)
        .single()
      crmUser = userByAuthId2
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if meeting exists
    const { data: existingMeeting, error: fetchError } = await supabase
      .from('meetings')
      .select('id, host_id, daily_room_name, task_id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (fetchError || !existingMeeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Check authorization - only host or admin can delete
    const isAdmin = ['admin', 'super_admin'].includes(crmUser.role)
    if (existingMeeting.host_id !== crmUser.id && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete Daily.co room
    if (existingMeeting.daily_room_name) {
      try {
        await deleteDailyRoom(existingMeeting.daily_room_name)
      } catch (roomError) {
        console.error('Error deleting Daily.co room:', roomError)
      }
    }

    // Soft delete meeting using admin client
    const { error: deleteError } = await supabaseAdmin
      .from('meetings')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting meeting:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Delete linked task
    if (existingMeeting.task_id) {
      await supabaseAdmin
        .from('tasks')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', existingMeeting.task_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/meetings/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
