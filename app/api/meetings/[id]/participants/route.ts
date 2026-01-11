import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { ParticipantInsert } from '@/types/meeting.types'

// GET /api/meetings/[id]/participants - List participants
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

    const { data: participants, error } = await supabase
      .from('meeting_participants')
      .select(`
        *,
        user:users(id, first_name, last_name, avatar_url, email)
      `)
      .eq('meeting_id', id)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching participants:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ participants: participants || [] })
  } catch (error) {
    console.error('Error in GET /api/meetings/[id]/participants:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/meetings/[id]/participants - Add participant
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

    // Check meeting exists and user has permission
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, host_id, max_participants, participant_count')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Check if user is host
    if (meeting.host_id !== crmUser.id) {
      return NextResponse.json({ error: 'Only host can add participants' }, { status: 403 })
    }

    // Check capacity
    if (meeting.participant_count >= meeting.max_participants) {
      return NextResponse.json({ error: 'Meeting is at capacity' }, { status: 400 })
    }

    const body: ParticipantInsert = await request.json()

    // Validate - must have either user_id or email
    if (!body.user_id && !body.email) {
      return NextResponse.json(
        { error: 'Either user_id or email is required' },
        { status: 400 }
      )
    }

    // If user_id provided, get user details
    let participantName = body.name
    let participantEmail = body.email

    if (body.user_id) {
      const { data: invitedUser } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', body.user_id)
        .single()

      if (invitedUser) {
        participantName = participantName || `${invitedUser.first_name} ${invitedUser.last_name}`
        participantEmail = participantEmail || invitedUser.email
      }
    }

    // Check if participant already exists
    let existingQuery = supabase
      .from('meeting_participants')
      .select('id')
      .eq('meeting_id', id)

    if (body.user_id) {
      existingQuery = existingQuery.eq('user_id', body.user_id)
    } else if (body.email) {
      existingQuery = existingQuery.eq('email', body.email)
    }

    const { data: existing } = await existingQuery.single()

    if (existing) {
      return NextResponse.json(
        { error: 'Participant already added' },
        { status: 400 }
      )
    }

    // Add participant
    const { data: participant, error: insertError } = await supabase
      .from('meeting_participants')
      .insert({
        meeting_id: id,
        user_id: body.user_id || null,
        email: participantEmail || null,
        name: participantName || 'Guest',
        role: body.role || 'participant',
        can_screenshare: body.can_screenshare ?? true,
        can_record: body.can_record ?? false,
        is_muted_on_join: body.is_muted_on_join ?? false,
        is_video_off_on_join: body.is_video_off_on_join ?? false,
        invite_status: 'pending',
      })
      .select(`
        *,
        user:users(id, first_name, last_name, avatar_url, email)
      `)
      .single()

    if (insertError) {
      console.error('Error adding participant:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ participant }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/meetings/[id]/participants:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/meetings/[id]/participants - Remove participant
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
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId2) {
      crmUser = userByAuthUserId2
    } else {
      const { data: userByAuthId2 } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()
      crmUser = userByAuthId2
    }

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check meeting exists
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id, host_id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // Check if user is host
    if (meeting.host_id !== crmUser.id) {
      return NextResponse.json({ error: 'Only host can remove participants' }, { status: 403 })
    }

    // Get participant ID from query params
    const participantId = request.nextUrl.searchParams.get('participantId')

    if (!participantId) {
      return NextResponse.json({ error: 'participantId is required' }, { status: 400 })
    }

    // Delete participant
    const { error: deleteError } = await supabase
      .from('meeting_participants')
      .delete()
      .eq('id', participantId)
      .eq('meeting_id', id)

    if (deleteError) {
      console.error('Error removing participant:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/meetings/[id]/participants:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
