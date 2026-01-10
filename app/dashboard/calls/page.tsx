import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { CallsClient } from './calls-client'

interface CallsPageProps {
  searchParams: Promise<{ phone?: string }>
}

export default async function CallsPage({ searchParams }: CallsPageProps) {
  const { phone: initialPhone } = await searchParams
  const supabase = await createClient()
  const user = await getCurrentUser()

  // Get leads for quick dial
  let leadsQuery = supabase
    .from('leads')
    .select('id, first_name, last_name, email, phone')
    .eq('is_deleted', false)
    .not('phone', 'is', null)
    .order('last_name')
    .limit(50)

  // If not manager/admin, only show own leads
  if (user?.role === 'sales_rep' || user?.role === 'senior_rep' || user?.role === 'closer') {
    leadsQuery = leadsQuery.eq('owner_id', user.id)
  }

  const { data: leads } = await leadsQuery

  // Get recent call history
  let callsQuery = supabase
    .from('calls')
    .select(`
      id,
      direction,
      disposition,
      from_number,
      to_number,
      duration_seconds,
      started_at,
      lead:leads(id, first_name, last_name)
    `)
    .eq('is_deleted', false)
    .order('started_at', { ascending: false })
    .limit(20)

  // If not manager/admin, only show own calls
  if (user?.role === 'sales_rep' || user?.role === 'senior_rep' || user?.role === 'closer') {
    callsQuery = callsQuery.eq('user_id', user.id)
  }

  const { data: recentCalls } = await callsQuery

  return (
    <CallsClient
      leads={leads || []}
      recentCalls={recentCalls || []}
      currentUser={user}
      initialPhone={initialPhone}
    />
  )
}
