import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { MeetingsClient } from './meetings-client'

export default async function MeetingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Get current user - try both auth_user_id and auth_id for compatibility
  let { data: currentUser } = await supabase
    .from('users')
    .select('id, first_name, last_name, role, organization_id, timezone')
    .eq('auth_user_id', user.id)
    .single()

  // Fallback to auth_id if auth_user_id doesn't work
  if (!currentUser) {
    const result = await supabase
      .from('users')
      .select('id, first_name, last_name, role, organization_id, timezone')
      .eq('auth_id', user.id)
      .single()
    currentUser = result.data
  }

  if (!currentUser) {
    redirect('/login')
  }

  // Get upcoming meetings
  const { data: upcomingMeetings } = await supabase
    .from('meetings')
    .select(`
      *,
      host:users!host_id(id, first_name, last_name, avatar_url),
      participants:meeting_participants(
        id, user_id, email, name, role, invite_status,
        user:users(id, first_name, last_name, avatar_url)
      ),
      lead:leads(id, first_name, last_name),
      contact:contacts(id, first_name, last_name),
      deal:deals(id, name)
    `)
    .eq('is_deleted', false)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50)

  // Get past meetings
  const { data: pastMeetings } = await supabase
    .from('meetings')
    .select(`
      *,
      host:users!host_id(id, first_name, last_name, avatar_url),
      participants:meeting_participants(
        id, user_id, email, name, role, invite_status,
        user:users(id, first_name, last_name, avatar_url)
      ),
      recordings:meeting_recordings(id, status, duration_seconds)
    `)
    .eq('is_deleted', false)
    .lt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: false })
    .limit(20)

  // Get organization users for inviting
  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, avatar_url')
    .eq('organization_id', currentUser.organization_id)
    .eq('is_active', true)
    .order('first_name')

  // Get leads for linking
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(100)

  // Get contacts for linking
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email')
    .eq('is_deleted', false)
    .order('first_name')
    .limit(100)

  // Get deals for linking
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name')
    .eq('is_deleted', false)
    .not('stage', 'in', '("closed_won","closed_lost")')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <MeetingsClient
      currentUser={currentUser}
      upcomingMeetings={upcomingMeetings || []}
      pastMeetings={pastMeetings || []}
      users={users || []}
      leads={leads || []}
      contacts={contacts || []}
      deals={deals || []}
    />
  )
}
