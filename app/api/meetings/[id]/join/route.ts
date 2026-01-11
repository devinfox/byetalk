import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createHostToken, createParticipantToken, getMeetingUrl, extendRoomExpiration } from '@/lib/daily'

// POST /api/meetings/[id]/join - Join a meeting (authenticated)
export async function POST(
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
      .select('id, first_name, last_name, email')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      crmUser = userByAuthUserId
    } else {
      // Fallback to auth_id
      const { data: userByAuthId } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('auth_id', user.id)
        .single()
      crmUser = userByAuthId
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get meeting
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select(`
        *,
        host:users!host_id(id, first_name, last_name)
      `)
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (meetingError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    if (!meeting.daily_room_name) {
      return NextResponse.json({ error: 'Video room not configured' }, { status: 400 })
    }

    // Check if meeting is cancelled
    if (meeting.status === 'cancelled') {
      return NextResponse.json({ error: 'Meeting has been cancelled' }, { status: 400 })
    }

    // Check if user is host or participant
    const isHost = meeting.host_id === crmUser.id

    // Check if user is already a participant
    const { data: existingParticipant } = await supabase
      .from('meeting_participants')
      .select('id')
      .eq('meeting_id', id)
      .eq('user_id', crmUser.id)
      .single()

    let participant

    if (!existingParticipant) {
      // Add user as participant
      const { data: newParticipant, error: participantError } = await supabase
        .from('meeting_participants')
        .insert({
          meeting_id: id,
          user_id: crmUser.id,
          name: `${crmUser.first_name} ${crmUser.last_name}`,
          email: crmUser.email,
          role: isHost ? 'host' : 'participant',
          invite_status: 'accepted',
        })
        .select()
        .single()

      if (participantError) {
        console.error('Error creating participant:', participantError)
        return NextResponse.json({ error: 'Failed to join meeting' }, { status: 500 })
      }

      participant = newParticipant
    } else {
      // Update existing participant status
      const { data: updatedParticipant } = await supabase
        .from('meeting_participants')
        .update({
          invite_status: 'accepted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingParticipant.id)
        .select()
        .single()

      participant = updatedParticipant
    }

    // Extend room expiration if needed
    try {
      await extendRoomExpiration(meeting.daily_room_name, 24)
    } catch (extendError) {
      console.error('Error extending room expiration:', extendError)
    }

    // Generate meeting token
    const userName = `${crmUser.first_name} ${crmUser.last_name}`
    let token

    try {
      if (isHost) {
        const tokenResponse = await createHostToken(meeting.daily_room_name, crmUser.id, userName)
        token = tokenResponse.token
      } else {
        const tokenResponse = await createParticipantToken(meeting.daily_room_name, crmUser.id, userName)
        token = tokenResponse.token
      }
    } catch (tokenError) {
      console.error('Error creating meeting token:', tokenError)
      return NextResponse.json({ error: 'Failed to generate meeting token' }, { status: 500 })
    }

    // Update meeting status if first join
    if (meeting.status === 'scheduled') {
      await supabase
        .from('meetings')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', id)
    }

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        host: meeting.host,
        recording_enabled: meeting.recording_enabled,
        chat_enabled: meeting.chat_enabled,
        screenshare_enabled: meeting.screenshare_enabled,
        virtual_bg_enabled: meeting.virtual_bg_enabled,
        noise_cancellation_enabled: meeting.noise_cancellation_enabled,
      },
      token,
      roomUrl: meeting.daily_room_url || getMeetingUrl(meeting.daily_room_name),
      participant,
      isHost,
    })
  } catch (error) {
    console.error('Error in POST /api/meetings/[id]/join:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
