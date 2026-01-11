import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { CalendarView } from './calendar-view'

export default async function CalendarPage() {
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  // Get tasks with due dates - only pending tasks assigned to current user
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      description,
      status,
      priority,
      task_type,
      due_at,
      completed_at,
      lead:leads(id, first_name, last_name),
      contact:contacts(id, first_name, last_name),
      deal:deals(id, name)
    `)
    .eq('assigned_to', currentUser.id)
    .eq('is_deleted', false)
    .eq('status', 'pending')
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })
    .limit(200)

  return (
    <CalendarView
      tasks={tasks || []}
      currentUser={currentUser}
      userTimezone={currentUser?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
    />
  )
}
