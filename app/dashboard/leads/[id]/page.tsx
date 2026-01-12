import { notFound } from 'next/navigation'
import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { LeadDetailView } from './lead-detail-view'

interface LeadPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch lead with owner and campaign in a single query using foreign key joins
  const { data: lead, error } = await supabase
    .from('leads')
    .select(`
      *,
      owner:users!leads_owner_id_fkey(id, first_name, last_name, email),
      campaign:campaigns(id, name, code)
    `)
    .eq('id', id)
    .eq('is_deleted', false)
    .single()

  if (error || !lead) {
    console.error('Lead fetch error:', error)
    console.error('Lead ID:', id)
    notFound()
  }

  // Run all independent queries in parallel for better performance
  const [
    currentUser,
    activitiesResult,
    notesResult,
    tasksResult,
    callsResult,
    directEmailsResult,
    linkedEmailIdsResult,
    usersResult,
    campaignsResult,
  ] = await Promise.all([
    getCurrentUser(),
    // Activity log
    supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', 'lead')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    // Notes with author
    supabase
      .from('notes')
      .select(`
        *,
        author:users!notes_created_by_fkey(id, first_name, last_name)
      `)
      .eq('entity_type', 'lead')
      .eq('entity_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
    // Tasks - combined query using OR for entity_id or lead_id
    supabase
      .from('tasks')
      .select(`
        *,
        assignee:users!tasks_assigned_to_fkey(id, first_name, last_name)
      `)
      .or(`and(entity_type.eq.lead,entity_id.eq.${id}),lead_id.eq.${id}`)
      .eq('is_deleted', false)
      .order('due_at', { ascending: true }),
    // Calls with user
    supabase
      .from('calls')
      .select(`
        *,
        user:users!calls_user_id_fkey(id, first_name, last_name)
      `)
      .eq('lead_id', id)
      .eq('is_deleted', false)
      .order('started_at', { ascending: false }),
    // Direct emails
    supabase
      .from('emails')
      .select(`
        *,
        thread:email_threads(id, subject)
      `)
      .eq('lead_id', id)
      .eq('is_deleted', false)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(50),
    // Linked email IDs
    supabase
      .from('email_lead_links')
      .select('email_id')
      .eq('lead_id', id),
    // Users for assignment dropdown
    supabase
      .from('users')
      .select('id, first_name, last_name, role')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .in('role', ['sales_rep', 'senior_rep', 'closer'])
      .order('first_name'),
    // Campaigns for dropdown
    supabase
      .from('campaigns')
      .select('id, name, code')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('name'),
  ])

  // Fetch linked emails if there are any (only query if we have IDs)
  let linkedEmails: any[] = []
  const linkedEmailIds = linkedEmailIdsResult.data
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

  // Dedupe tasks (in case a task has both entity_id and lead_id set)
  const allTasks = tasksResult.data || []
  const tasks = allTasks.filter((task, index, self) =>
    index === self.findIndex(t => t.id === task.id)
  )

  // Combine and dedupe emails
  const allEmails = [...(directEmailsResult.data || []), ...linkedEmails]
  const emails = allEmails.filter((email, index, self) =>
    index === self.findIndex(e => e.id === email.id)
  ).sort((a, b) => new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime())

  return (
    <LeadDetailView
      lead={lead}
      activities={activitiesResult.data || []}
      notes={notesResult.data || []}
      tasks={tasks}
      calls={callsResult.data || []}
      emails={emails}
      users={usersResult.data || []}
      campaigns={campaignsResult.data || []}
      currentUser={currentUser}
    />
  )
}
