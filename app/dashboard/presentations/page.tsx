import { getCurrentUser, createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { PresentationsPageClient } from './presentations-client'

export default async function PresentationsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Fetch leads for linking - show all accessible leads
  // The query will be filtered by RLS policies automatically
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, company')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(100)

  if (leadsError) {
    console.error('Error fetching leads:', leadsError)
  }

  console.log('Presentations page - User:', user.id, 'Role:', user.role, 'Leads found:', leads?.length || 0)

  return <PresentationsPageClient userId={user.id} leads={leads || []} />
}
