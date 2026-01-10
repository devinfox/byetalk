import { notFound } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { LeadDetailView } from './lead-detail-view'

interface LeadPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const currentUser = await getCurrentUser()

  // Fetch lead with related data
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  // Fetch owner separately if lead exists
  let owner = null
  let campaign = null
  if (lead?.owner_id) {
    const { data: ownerData } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('id', lead.owner_id)
      .single()
    owner = ownerData
  }
  if (lead?.campaign_id) {
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('id, name, code')
      .eq('id', lead.campaign_id)
      .single()
    campaign = campaignData
  }

  if (error || !lead) {
    console.error('Lead fetch error:', error)
    console.error('Lead ID:', id)
    notFound()
  }

  // Fetch activity log for this lead
  const { data: activities } = await supabase
    .from('activity_log')
    .select('*')
    .eq('entity_type', 'lead')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch notes for this lead
  const { data: notes } = await supabase
    .from('notes')
    .select(`
      *,
      author:users!notes_created_by_fkey(id, first_name, last_name)
    `)
    .eq('entity_type', 'lead')
    .eq('entity_id', id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  // Fetch tasks for this lead (both entity-based and lead_id-based)
  const { data: entityTasks } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:users!tasks_assigned_to_fkey(id, first_name, last_name)
    `)
    .eq('entity_type', 'lead')
    .eq('entity_id', id)
    .eq('is_deleted', false)
    .order('due_at', { ascending: true })

  // Also fetch tasks linked via lead_id (from call processing)
  const { data: leadIdTasks } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:users!tasks_assigned_to_fkey(id, first_name, last_name)
    `)
    .eq('lead_id', id)
    .eq('is_deleted', false)
    .order('due_at', { ascending: true })

  // Combine and dedupe tasks
  const allTasks = [...(entityTasks || []), ...(leadIdTasks || [])]
  const tasks = allTasks.filter((task, index, self) =>
    index === self.findIndex(t => t.id === task.id)
  ).sort((a, b) => new Date(a.due_at || 0).getTime() - new Date(b.due_at || 0).getTime())

  // Fetch calls for this lead
  const { data: calls } = await supabase
    .from('calls')
    .select(`
      *,
      user:users!calls_user_id_fkey(id, first_name, last_name)
    `)
    .eq('lead_id', id)
    .eq('is_deleted', false)
    .order('started_at', { ascending: false })

  // Fetch emails for this lead (via direct lead_id or via email_lead_links)
  const { data: directEmails } = await supabase
    .from('emails')
    .select(`
      *,
      thread:email_threads(id, subject)
    `)
    .eq('lead_id', id)
    .eq('is_deleted', false)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(50)

  // Also fetch emails linked via email_lead_links table
  const { data: linkedEmailIds } = await supabase
    .from('email_lead_links')
    .select('email_id')
    .eq('lead_id', id)

  let linkedEmails: any[] = []
  if (linkedEmailIds && linkedEmailIds.length > 0) {
    const emailIds = linkedEmailIds.map(e => e.email_id)
    const { data: fetchedLinkedEmails } = await supabase
      .from('emails')
      .select(`
        *,
        thread:email_threads(id, subject)
      `)
      .in('id', emailIds)
      .eq('is_deleted', false)
      .order('sent_at', { ascending: false, nullsFirst: false })
    linkedEmails = fetchedLinkedEmails || []
  }

  // Combine and dedupe emails
  const allEmails = [...(directEmails || []), ...linkedEmails]
  const emails = allEmails.filter((email, index, self) =>
    index === self.findIndex(e => e.id === email.id)
  ).sort((a, b) => new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime())

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

  // Merge lead with related data
  const leadWithRelations = {
    ...lead,
    owner,
    campaign,
  }

  return (
    <LeadDetailView
      lead={leadWithRelations}
      activities={activities || []}
      notes={notes || []}
      tasks={tasks || []}
      calls={calls || []}
      emails={emails || []}
      users={users || []}
      campaigns={campaigns || []}
      currentUser={currentUser}
    />
  )
}
