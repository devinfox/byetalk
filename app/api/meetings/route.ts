import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createDailyRoom, getMeetingUrl } from '@/lib/daily'
import type { MeetingInsert } from '@/types/meeting.types'

// GET /api/meetings - List meetings
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const upcoming = searchParams.get('upcoming') === 'true'
    const past = searchParams.get('past') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('meetings')
      .select(`
        *,
        host:users!host_id(id, first_name, last_name, avatar_url, email),
        participants:meeting_participants(
          id, user_id, email, name, role, invite_status,
          user:users(id, first_name, last_name, avatar_url)
        ),
        lead:leads(id, first_name, last_name),
        contact:contacts(id, first_name, last_name),
        deal:deals(id, name)
      `)
      .eq('is_deleted', false)
      .order('scheduled_at', { ascending: upcoming })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (upcoming) {
      query = query.gte('scheduled_at', new Date().toISOString())
    }

    if (past) {
      query = query.lt('scheduled_at', new Date().toISOString())
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: meetings, error } = await query

    if (error) {
      console.error('Error fetching meetings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get total count
    const { count } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false)

    return NextResponse.json({
      meetings: meetings || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error in GET /api/meetings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/meetings - Create a new meeting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current CRM user
    const { data: crmUser, error: userError } = await supabase
      .from('users')
      .select('id, first_name, last_name, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userError || !crmUser) {
      // Fallback to auth_id
      const { data: fallbackUser } = await supabase
        .from('users')
        .select('id, first_name, last_name, organization_id')
        .eq('auth_id', user.id)
        .single()

      if (!fallbackUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      Object.assign(crmUser || {}, fallbackUser)
    }

    const body = await request.json()

    // Validate required fields
    if (!body.title || !body.scheduled_at) {
      return NextResponse.json(
        { error: 'Title and scheduled_at are required' },
        { status: 400 }
      )
    }

    // Extract new fields
    const meetingType = body.meeting_type || 'client'
    const teamMemberIds: string[] = body.team_member_ids || []
    const autoRecord = body.auto_record !== false // Default true
    const screenshareRequiresApproval = body.screenshare_requires_approval !== false // Default true
    const recurringConfig = body.recurring || null

    // Create Daily.co room with auto-recording enabled
    let dailyRoom
    try {
      dailyRoom = await createDailyRoom({
        properties: {
          max_participants: body.max_participants || 10,
          // Always enable cloud recording
          enable_recording: 'cloud',
          // Auto-start recording when host joins
          start_cloud_recording: autoRecord,
          enable_screenshare: true,
          enable_chat: true,
          enable_noise_cancellation_ui: true,
          // Knocking for waiting room (client meetings)
          enable_knocking: meetingType === 'client',
        },
      })
    } catch (roomError) {
      console.error('Error creating Daily.co room:', roomError)
      return NextResponse.json(
        { error: 'Failed to create video room' },
        { status: 500 }
      )
    }

    // Create meeting in database
    const { data: meeting, error: insertError } = await supabase
      .from('meetings')
      .insert({
        title: body.title,
        description: body.description || null,
        scheduled_at: body.scheduled_at,
        duration_minutes: body.duration_minutes || 30,
        is_public: body.is_public !== false,
        max_participants: body.max_participants || 10,
        require_approval: meetingType === 'client', // Client meetings require approval
        // All features always enabled
        recording_enabled: true,
        virtual_bg_enabled: true,
        chat_enabled: true,
        screenshare_enabled: true,
        noise_cancellation_enabled: true,
        // New fields stored in config
        daily_room_config: {
          ...dailyRoom.config,
          meeting_type: meetingType,
          auto_record: autoRecord,
          screenshare_requires_approval: screenshareRequiresApproval,
          recurring: recurringConfig,
        },
        deal_id: body.deal_id || null,
        lead_id: body.lead_id || null,
        contact_id: body.contact_id || null,
        host_id: crmUser!.id,
        organization_id: crmUser!.organization_id,
        daily_room_name: dailyRoom.name,
        daily_room_url: dailyRoom.url || getMeetingUrl(dailyRoom.name),
      })
      .select(`
        *,
        host:users!host_id(id, first_name, last_name, avatar_url, email)
      `)
      .single()

    if (insertError) {
      console.error('Error creating meeting:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Add host as participant
    await supabase.from('meeting_participants').insert({
      meeting_id: meeting.id,
      user_id: crmUser!.id,
      name: `${crmUser!.first_name} ${crmUser!.last_name}`,
      role: 'host',
      invite_status: 'accepted',
    })

    // Add invited team members as participants
    if (teamMemberIds.length > 0) {
      // Get team member details
      const { data: teamMembers } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', teamMemberIds)

      if (teamMembers && teamMembers.length > 0) {
        const participantInserts = teamMembers.map(member => ({
          meeting_id: meeting.id,
          user_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          role: 'participant',
          invite_status: 'pending',
        }))

        await supabase.from('meeting_participants').insert(participantInserts)
      }
    }

    // Create a linked task for calendar integration
    await supabase.from('tasks').insert({
      title: `Meeting: ${meeting.title}`,
      description: meeting.description,
      assigned_to: crmUser!.id,
      due_at: meeting.scheduled_at,
      task_type: 'meeting',
      entity_type: 'meeting',
      entity_id: meeting.id,
      deal_id: meeting.deal_id,
      lead_id: meeting.lead_id,
      contact_id: meeting.contact_id,
      priority: 2,
    })

    // Update meeting with task_id
    const { data: task } = await supabase
      .from('tasks')
      .select('id')
      .eq('entity_type', 'meeting')
      .eq('entity_id', meeting.id)
      .single()

    if (task) {
      await supabase
        .from('meetings')
        .update({ task_id: task.id })
        .eq('id', meeting.id)
    }

    // Handle recurring meetings (create future instances)
    if (recurringConfig && meetingType === 'internal') {
      await createRecurringMeetings(supabase, meeting, crmUser!, teamMemberIds, recurringConfig, dailyRoom)
    }

    return NextResponse.json({ meeting }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/meetings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to create recurring meeting instances
async function createRecurringMeetings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  baseMeeting: any,
  host: { id: string; first_name: string; last_name: string; organization_id: string },
  teamMemberIds: string[],
  recurringConfig: { frequency: string; end_date: string },
  dailyRoom: any
) {
  const { frequency, end_date } = recurringConfig
  const baseDate = new Date(baseMeeting.scheduled_at)
  const endDate = new Date(end_date)

  let intervalDays = 7 // Default weekly
  switch (frequency) {
    case 'daily': intervalDays = 1; break
    case 'weekly': intervalDays = 7; break
    case 'biweekly': intervalDays = 14; break
    case 'monthly': intervalDays = 30; break
  }

  const meetings = []
  let currentDate = new Date(baseDate)
  currentDate.setDate(currentDate.getDate() + intervalDays)

  while (currentDate <= endDate) {
    // Create new Daily.co room for each recurring meeting
    let recurringRoom
    try {
      recurringRoom = await createDailyRoom({
        properties: {
          max_participants: baseMeeting.max_participants,
          enable_recording: 'cloud',
          start_cloud_recording: true,
          enable_screenshare: true,
          enable_chat: true,
          enable_noise_cancellation_ui: true,
        },
      })
    } catch (err) {
      console.error('Error creating recurring room:', err)
      currentDate.setDate(currentDate.getDate() + intervalDays)
      continue
    }

    meetings.push({
      title: baseMeeting.title,
      description: baseMeeting.description,
      scheduled_at: currentDate.toISOString(),
      duration_minutes: baseMeeting.duration_minutes,
      is_public: false, // Internal meetings are not public
      max_participants: baseMeeting.max_participants,
      recording_enabled: true,
      virtual_bg_enabled: true,
      chat_enabled: true,
      screenshare_enabled: true,
      noise_cancellation_enabled: true,
      daily_room_config: {
        meeting_type: 'internal',
        auto_record: true,
        screenshare_requires_approval: true,
        recurring_parent_id: baseMeeting.id,
      },
      host_id: host.id,
      organization_id: host.organization_id,
      daily_room_name: recurringRoom.name,
      daily_room_url: recurringRoom.url || getMeetingUrl(recurringRoom.name),
    })

    currentDate.setDate(currentDate.getDate() + intervalDays)
  }

  if (meetings.length > 0) {
    const { data: createdMeetings } = await supabase
      .from('meetings')
      .insert(meetings)
      .select('id')

    // Add participants to each recurring meeting
    if (createdMeetings) {
      for (const meeting of createdMeetings) {
        // Add host
        await supabase.from('meeting_participants').insert({
          meeting_id: meeting.id,
          user_id: host.id,
          name: `${host.first_name} ${host.last_name}`,
          role: 'host',
          invite_status: 'accepted',
        })

        // Add team members
        if (teamMemberIds.length > 0) {
          const { data: teamMembers } = await supabase
            .from('users')
            .select('id, first_name, last_name, email')
            .in('id', teamMemberIds)

          if (teamMembers) {
            const participantInserts = teamMembers.map(member => ({
              meeting_id: meeting.id,
              user_id: member.id,
              name: `${member.first_name} ${member.last_name}`,
              email: member.email,
              role: 'participant',
              invite_status: 'pending',
            }))
            await supabase.from('meeting_participants').insert(participantInserts)
          }
        }
      }
    }
  }
}
