import { notFound } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { DealDetailView } from './deal-detail-view'

interface DealPageProps {
  params: Promise<{ id: string }>
}

export default async function DealPage({ params }: DealPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  // Fetch deal with related data
  const { data: deal, error } = await supabase
    .from('deals')
    .select(`
      *,
      owner:users!deals_owner_id_fkey(id, first_name, last_name, email),
      secondary_owner:users!deals_secondary_owner_id_fkey(id, first_name, last_name),
      lead:leads!deals_lead_id_fkey(id, first_name, last_name, email, phone),
      campaign:campaigns(id, name, code)
    `)
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (error) {
    console.error('Deal fetch error:', error)
    notFound()
  }

  if (!deal) {
    console.error('Deal not found for id:', id)
    notFound()
  }

  // Fetch stage history
  const { data: stageHistory } = await supabase
    .from('deal_stage_history')
    .select(`
      *,
      changed_by_user:users!deal_stage_history_changed_by_fkey(id, first_name, last_name)
    `)
    .eq('deal_id', id)
    .order('created_at', { ascending: false })

  // Fetch activity log for this deal
  const { data: activities } = await supabase
    .from('activity_log')
    .select('*')
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch notes for this deal
  const { data: notes } = await supabase
    .from('notes')
    .select(`
      *,
      author:users!notes_created_by_fkey(id, first_name, last_name)
    `)
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  // Fetch tasks for this deal
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:users!tasks_assigned_to_fkey(id, first_name, last_name)
    `)
    .eq('entity_type', 'deal')
    .eq('entity_id', id)
    .eq('is_deleted', false)
    .order('due_at', { ascending: true })

  // Fetch funding events
  const { data: fundingEvents } = await supabase
    .from('funding_events')
    .select('*')
    .eq('deal_id', id)
    .eq('is_deleted', false)
    .order('transaction_date', { ascending: false })

  // Get users for assignment dropdown
  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name, role')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .in('role', ['sales_rep', 'senior_rep', 'closer'])
    .order('first_name')

  // Get campaigns for dropdown
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, code')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('name')

  return (
    <DealDetailView
      deal={deal}
      stageHistory={stageHistory || []}
      activities={activities || []}
      notes={notes || []}
      tasks={tasks || []}
      fundingEvents={fundingEvents || []}
      users={users || []}
      campaigns={campaigns || []}
      currentUser={currentUser}
    />
  )
}
