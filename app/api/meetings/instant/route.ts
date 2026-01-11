import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createDailyRoom, getMeetingUrl } from '@/lib/daily'

// POST /api/meetings/instant - Create an instant meeting and get link immediately
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current CRM user
    let crmUser = null
    const { data: userByAuthUserId } = await supabase
      .from('users')
      .select('id, first_name, last_name, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      crmUser = userByAuthUserId
    } else {
      // Fallback to auth_id
      const { data: userByAuthId } = await supabase
        .from('users')
        .select('id, first_name, last_name, organization_id')
        .eq('auth_id', user.id)
        .single()

      crmUser = userByAuthId
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Optional: get custom title from request body
    const body = await request.json().catch(() => ({}))
    const title = body.title || `Instant Meeting`

    // Create Daily.co room with auto-recording
    let dailyRoom
    try {
      dailyRoom = await createDailyRoom({
        properties: {
          max_participants: 10,
          enable_recording: 'cloud',
          start_cloud_recording: true, // Auto-record
          enable_screenshare: true,
          enable_chat: true,
          enable_noise_cancellation_ui: true,
          enable_knocking: false, // No waiting room for instant meetings
        },
      })
    } catch (roomError) {
      console.error('Error creating Daily.co room:', roomError)
      return NextResponse.json(
        { error: 'Failed to create video room' },
        { status: 500 }
      )
    }

    // Create meeting in database - scheduled for right now
    const { data: meeting, error: insertError } = await supabase
      .from('meetings')
      .insert({
        title,
        description: null,
        scheduled_at: new Date().toISOString(),
        duration_minutes: 60, // Default 1 hour for instant meetings
        is_public: true,
        max_participants: 10,
        require_approval: false, // No approval needed for instant meetings
        recording_enabled: true,
        virtual_bg_enabled: true,
        chat_enabled: true,
        screenshare_enabled: true,
        noise_cancellation_enabled: true,
        status: 'in_progress', // Start immediately
        daily_room_config: {
          meeting_type: 'instant',
          auto_record: true,
          screenshare_requires_approval: false, // Easier for instant meetings
        },
        host_id: crmUser.id,
        organization_id: crmUser.organization_id,
        daily_room_name: dailyRoom.name,
        daily_room_url: dailyRoom.url || getMeetingUrl(dailyRoom.name),
      })
      .select('*')
      .single()

    if (insertError) {
      console.error('Error creating instant meeting:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Add host as participant
    await supabase.from('meeting_participants').insert({
      meeting_id: meeting.id,
      user_id: crmUser.id,
      name: `${crmUser.first_name} ${crmUser.last_name}`,
      role: 'host',
      invite_status: 'accepted',
    })

    // Generate the invite URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const inviteUrl = `${baseUrl}/join/${meeting.invite_code}`

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        invite_code: meeting.invite_code,
        invite_url: inviteUrl,
        daily_room_url: meeting.daily_room_url,
      },
      roomUrl: `/dashboard/meetings/${meeting.id}`,
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/meetings/instant:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
