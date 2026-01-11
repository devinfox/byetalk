import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createGuestToken, getMeetingUrl, extendRoomExpiration } from '@/lib/daily'

// GET /api/meetings/join/[code] - Get meeting info by invite code (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    // Find meeting by invite code
    const { data: meeting, error } = await getSupabaseAdmin()
      .from('meetings')
      .select(`
        id, title, description, scheduled_at, duration_minutes, status,
        is_public, require_approval, max_participants, participant_count,
        daily_room_config,
        host:users!host_id(first_name, last_name)
      `)
      .eq('invite_code', code.toUpperCase())
      .eq('is_deleted', false)
      .single()

    if (error || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Check if meeting is public
    if (!meeting.is_public) {
      return NextResponse.json({ error: 'This meeting is not public' }, { status: 403 })
    }

    // Check if meeting is cancelled
    if (meeting.status === 'cancelled') {
      return NextResponse.json({ error: 'This meeting has been cancelled' }, { status: 400 })
    }

    const host = meeting.host as unknown as { first_name: string; last_name: string } | null
    const config = meeting.daily_room_config as Record<string, unknown> | null
    const meetingType = config?.meeting_type as string | undefined

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        scheduled_at: meeting.scheduled_at,
        duration_minutes: meeting.duration_minutes,
        status: meeting.status,
        require_approval: meeting.require_approval,
        host_name: host ? `${host.first_name} ${host.last_name}` : 'Host',
        participant_count: meeting.participant_count,
        max_participants: meeting.max_participants,
        meeting_type: meetingType,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/meetings/join/[code]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/meetings/join/[code] - Join meeting as guest (public)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const body = await request.json()

    // Validate guest info
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const guestName = body.name.trim()
    const guestEmail = body.email?.trim() || null

    // Find meeting by invite code
    const { data: meeting, error: meetingError } = await getSupabaseAdmin()
      .from('meetings')
      .select(`
        id, title, status, is_public, require_approval,
        max_participants, participant_count,
        daily_room_name, daily_room_url,
        host:users!host_id(first_name, last_name)
      `)
      .eq('invite_code', code.toUpperCase())
      .eq('is_deleted', false)
      .single()

    if (meetingError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Validations
    if (!meeting.is_public) {
      return NextResponse.json({ error: 'This meeting is not public' }, { status: 403 })
    }

    if (meeting.status === 'cancelled') {
      return NextResponse.json({ error: 'This meeting has been cancelled' }, { status: 400 })
    }

    if (!meeting.daily_room_name) {
      return NextResponse.json({ error: 'Video room not configured' }, { status: 400 })
    }

    // Check capacity
    if (meeting.participant_count >= meeting.max_participants) {
      return NextResponse.json({ error: 'Meeting is at capacity' }, { status: 400 })
    }

    // Check if guest with same email already exists
    if (guestEmail) {
      const { data: existingParticipant } = await getSupabaseAdmin()
        .from('meeting_participants')
        .select('id')
        .eq('meeting_id', meeting.id)
        .eq('email', guestEmail)
        .single()

      if (existingParticipant) {
        // Update existing participant
        await getSupabaseAdmin()
          .from('meeting_participants')
          .update({
            name: guestName,
            invite_status: 'accepted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingParticipant.id)
      }
    }

    // Generate unique guest ID
    const guestId = `guest-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    // Create participant record
    const { data: participant, error: participantError } = await getSupabaseAdmin()
      .from('meeting_participants')
      .insert({
        meeting_id: meeting.id,
        email: guestEmail,
        name: guestName,
        role: 'participant',
        invite_status: meeting.require_approval ? 'pending' : 'accepted',
      })
      .select()
      .single()

    if (participantError) {
      console.error('Error creating participant:', participantError)
      return NextResponse.json({ error: 'Failed to join meeting' }, { status: 500 })
    }

    // If approval required, return waiting status
    if (meeting.require_approval) {
      return NextResponse.json({
        status: 'waiting_approval',
        participantId: participant.id,
        message: 'Waiting for host approval to join the meeting',
      })
    }

    // Extend room expiration
    try {
      await extendRoomExpiration(meeting.daily_room_name, 24)
    } catch (extendError) {
      console.error('Error extending room expiration:', extendError)
    }

    // Generate guest token
    let token
    try {
      const tokenResponse = await createGuestToken(meeting.daily_room_name, guestId, guestName)
      token = tokenResponse.token
    } catch (tokenError) {
      console.error('Error creating guest token:', tokenError)
      return NextResponse.json({ error: 'Failed to generate meeting token' }, { status: 500 })
    }

    // Update meeting status if first join
    if (meeting.status === 'scheduled') {
      await getSupabaseAdmin()
        .from('meetings')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', meeting.id)
    }

    const hostInfo = meeting.host as unknown as { first_name: string; last_name: string } | null
    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        status: meeting.status,
        host_name: hostInfo ? `${hostInfo.first_name} ${hostInfo.last_name}` : 'Host',
      },
      token,
      roomUrl: meeting.daily_room_url || getMeetingUrl(meeting.daily_room_name),
      participantId: participant.id,
    })
  } catch (error) {
    console.error('Error in POST /api/meetings/join/[code]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
