import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    return <div className="text-white">Please log in to view tasks</div>
  }

  // Get tasks assigned to user
  let tasksQuery = supabase
    .from('tasks')
    .select(`
      *,
      assigned_by_user:users!tasks_assigned_by_fkey(id, first_name, last_name),
      lead:leads(id, first_name, last_name),
      deal:deals(id, name),
      call:calls(id, to_number, started_at)
    `)
    .eq('is_deleted', false)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('priority', { ascending: true })

  // Managers/admins see all tasks, others see only their own
  if (user.role === 'sales_rep' || user.role === 'senior_rep' || user.role === 'closer') {
    tasksQuery = tasksQuery.eq('assigned_to', user.id)
  }

  const { data: tasks } = await tasksQuery.limit(100)

  // Get leads for task creation
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name')
    .eq('is_deleted', false)
    .order('last_name')
    .limit(100)

  // Get deals for task creation
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name')
    .eq('is_deleted', false)
    .order('name')
    .limit(100)

  // Get users for assignment (managers/admins only)
  let usersForAssignment: { id: string; first_name: string; last_name: string }[] = []
  if (user.role === 'manager' || user.role === 'admin' || user.role === 'super_admin') {
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('first_name')

    usersForAssignment = users || []
  }

  // Get task stats
  const pendingCount = tasks?.filter(t => t.status === 'pending').length || 0
  const overdueCount = tasks?.filter(t =>
    t.status === 'pending' && t.due_at && new Date(t.due_at) < new Date()
  ).length || 0
  const completedTodayCount = tasks?.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false
    const completedDate = new Date(t.completed_at).toDateString()
    return completedDate === new Date().toDateString()
  }).length || 0
  const aiGeneratedCount = tasks?.filter(t => t.source === 'ai_call_analysis').length || 0

  return (
    <TasksClient
      tasks={tasks || []}
      leads={leads || []}
      deals={deals || []}
      users={usersForAssignment}
      currentUser={user}
      stats={{
        pending: pendingCount,
        overdue: overdueCount,
        completedToday: completedTodayCount,
        aiGenerated: aiGeneratedCount,
      }}
    />
  )
}
