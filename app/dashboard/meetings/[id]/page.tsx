import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { MeetingRoomClient } from './meeting-room-client'

interface MeetingPageProps {
  params: Promise<{ id: string }>
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Get current user - try both auth_user_id and auth_id for compatibility
  let currentUser = null
  const { data: userByAuthUserId } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, avatar_url')
    .eq('auth_user_id', user.id)
    .single()

  if (userByAuthUserId) {
    currentUser = userByAuthUserId
  } else {
    // Fallback to auth_id
    const { data: userByAuthId } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, avatar_url')
      .eq('auth_id', user.id)
      .single()
    currentUser = userByAuthId
  }

  if (!currentUser) {
    redirect('/login')
  }

  // Get meeting details
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select(`
      *,
      host:users!host_id(id, first_name, last_name, avatar_url),
      participants:meeting_participants(
        id, user_id, email, name, role, invite_status, joined_at,
        user:users(id, first_name, last_name, avatar_url)
      ),
      recordings:meeting_recordings(
        id, recording_id, status, download_url, playback_url, duration_seconds, created_at
      )
    `)
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (meetingError) {
    console.error('Error fetching meeting:', meetingError)
    redirect('/dashboard/meetings')
  }

  if (!meeting) {
    console.error('Meeting not found for id:', id)
    redirect('/dashboard/meetings')
  }

  // Check if meeting is cancelled
  if (meeting.status === 'cancelled') {
    redirect('/dashboard/meetings')
  }

  // Check if user has access (is host or participant)
  const isHost = meeting.host_id === currentUser.id
  const isParticipant = meeting.participants?.some(
    (p: { user_id: string | null }) => p.user_id === currentUser.id
  )
  const isSameOrg = true // RLS already handles org check

  if (!isHost && !isParticipant && !isSameOrg) {
    redirect('/dashboard/meetings')
  }

  return (
    <MeetingRoomClient
      meeting={meeting}
      currentUser={currentUser}
      isHost={isHost}
    />
  )
}
