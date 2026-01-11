import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { listAllRecordings, getRecordingAccessLink, DailyRecording } from '@/lib/daily'

// Admin client for operations that bypass RLS
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/meetings/recordings/sync - Sync recordings from Daily.co
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user
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

    // Fetch ALL recordings from Daily.co
    console.log('Fetching all recordings from Daily.co...')
    const allRecordings = await listAllRecordings(100)
    console.log(`Found ${allRecordings.length} recordings in Daily.co`)

    // Get all meetings with daily room names for matching
    const { data: meetings } = await supabaseAdmin
      .from('meetings')
      .select('id, daily_room_name, title')
      .not('daily_room_name', 'is', null)

    // Create a map of room_name -> meeting for quick lookup
    const roomToMeetingMap = new Map<string, { id: string; title: string }>()
    for (const meeting of meetings || []) {
      if (meeting.daily_room_name) {
        roomToMeetingMap.set(meeting.daily_room_name, { id: meeting.id, title: meeting.title })
      }
    }

    let syncedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const syncResults: Array<{
      recording_id: string
      room_name: string
      meeting_id?: string
      status: 'synced' | 'skipped' | 'error'
      error?: string
    }> = []

    // Process each recording
    for (const recording of allRecordings) {
      try {
        // Check if recording already exists in database
        const { data: existingRecording } = await supabaseAdmin
          .from('meeting_recordings')
          .select('id')
          .eq('recording_id', recording.id)
          .single()

        if (existingRecording) {
          skippedCount++
          syncResults.push({
            recording_id: recording.id,
            room_name: recording.room_name,
            status: 'skipped',
          })
          continue
        }

        // Try to match to a meeting
        const matchedMeeting = roomToMeetingMap.get(recording.room_name)

        // Get access link for the recording
        let accessLink = null
        try {
          const access = await getRecordingAccessLink(recording.id)
          accessLink = access.download_link
        } catch (accessError) {
          console.error('Error getting access link for recording:', recording.id, accessError)
        }

        // Insert recording into database
        const insertData: Record<string, unknown> = {
          recording_id: recording.id,
          room_name: recording.room_name,
          status: recording.status === 'finished' ? 'ready' : recording.status,
          duration_seconds: recording.duration,
          download_url: accessLink,
          playback_url: accessLink,
          storage_provider: 'daily',
          started_at: new Date(recording.start_ts * 1000).toISOString(),
        }

        // Only set meeting_id if we found a match
        if (matchedMeeting) {
          insertData.meeting_id = matchedMeeting.id
        }

        const { error: insertError } = await supabaseAdmin
          .from('meeting_recordings')
          .insert(insertData)

        if (insertError) {
          console.error('Error inserting recording:', insertError)
          errorCount++
          syncResults.push({
            recording_id: recording.id,
            room_name: recording.room_name,
            meeting_id: matchedMeeting?.id,
            status: 'error',
            error: insertError.message,
          })
        } else {
          syncedCount++
          syncResults.push({
            recording_id: recording.id,
            room_name: recording.room_name,
            meeting_id: matchedMeeting?.id,
            status: 'synced',
          })
        }
      } catch (recordingError) {
        console.error(`Error syncing recording ${recording.id}:`, recordingError)
        errorCount++
        syncResults.push({
          recording_id: recording.id,
          room_name: recording.room_name,
          status: 'error',
          error: recordingError instanceof Error ? recordingError.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      total_in_daily: allRecordings.length,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
      results: syncResults,
    })
  } catch (error) {
    console.error('Error in POST /api/meetings/recordings/sync:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
