import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { LeadsTable } from './leads-table'
import { LeadsHeader } from './leads-header'
import { Users, UserPlus, Phone, CheckCircle, ArrowRight } from 'lucide-react'

const LEADS_PER_PAGE = 25

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; search?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const user = await getCurrentUser()
  const currentPage = parseInt(params.page || '1')
  const statusFilter = params.status || 'all'
  const searchQuery = params.search || ''

  // Build query based on user role
  let query = supabase
    .from('leads')
    .select(`
      *,
      owner:users!leads_owner_id_fkey(id, first_name, last_name),
      campaign:campaigns(id, name, code)
    `, { count: 'exact' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  // If not manager/admin, only show own leads
  if (user?.role === 'sales_rep' || user?.role === 'senior_rep' || user?.role === 'closer') {
    query = query.eq('owner_id', user.id)
  }

  // Apply status filter
  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  // Apply search filter
  if (searchQuery) {
    query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
  }

  // Pagination
  const offset = (currentPage - 1) * LEADS_PER_PAGE
  const { data: leads, error, count } = await query.range(offset, offset + LEADS_PER_PAGE - 1)

  const totalPages = Math.ceil((count || 0) / LEADS_PER_PAGE)

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

  // Get lead stats
  const { data: stats } = await supabase
    .from('leads')
    .select('status')
    .eq('is_deleted', false)

  const leadStats = {
    total: stats?.length || 0,
    new: stats?.filter(l => l.status === 'new').length || 0,
    contacted: stats?.filter(l => l.status === 'contacted').length || 0,
    qualified: stats?.filter(l => l.status === 'qualified').length || 0,
    converted: stats?.filter(l => l.status === 'converted').length || 0,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <LeadsHeader
        users={users || []}
        campaigns={campaigns || []}
        currentUserId={user?.id}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Leads" value={leadStats.total} icon={Users} />
        <StatCard label="New" value={leadStats.new} icon={UserPlus} color="blue" />
        <StatCard label="Contacted" value={leadStats.contacted} icon={Phone} color="yellow" />
        <StatCard label="Qualified" value={leadStats.qualified} icon={CheckCircle} color="green" />
        <StatCard label="Converted" value={leadStats.converted} icon={ArrowRight} color="purple" />
      </div>

      {/* Leads Table */}
      <LeadsTable
        leads={leads || []}
        users={users || []}
        campaigns={campaigns || []}
        currentUser={user}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={count || 0}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'gray'
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color?: 'gray' | 'blue' | 'yellow' | 'green' | 'purple'
}) {
  const iconColors = {
    gray: 'text-gray-400',
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
  }

  const bgColors = {
    gray: 'bg-white/10',
    blue: 'bg-blue-500/20',
    yellow: 'bg-yellow-500/20',
    green: 'bg-green-500/20',
    purple: 'bg-purple-500/20',
  }

  return (
    <div className="glass-card p-5 text-center">
      <div className="flex items-center justify-center mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColors[color]}`}>
          <Icon className={`w-5 h-5 ${iconColors[color]}`} />
        </div>
      </div>
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${color === 'yellow' ? 'text-gold-gradient' : 'text-white'}`}>{value}</p>
    </div>
  )
}
