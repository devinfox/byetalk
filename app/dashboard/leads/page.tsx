import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { LeadsHeader } from './leads-header'
import { LeadImportGroups } from './lead-import-groups'
import { Users, UserPlus, Phone, CheckCircle, ArrowRight } from 'lucide-react'

export default async function LeadsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  // Get users for assignment dropdown (admin only)
  const { data: users } = isAdmin
    ? await supabase
        .from('users')
        .select('id, first_name, last_name, role')
        .eq('is_deleted', false)
        .eq('is_active', true)
        .in('role', ['sales_rep', 'senior_rep', 'closer'])
        .order('first_name')
    : { data: [] }

  // Get campaigns for dropdown (admin only)
  const { data: campaigns } = isAdmin
    ? await supabase
        .from('campaigns')
        .select('id, name, code')
        .eq('is_deleted', false)
        .eq('is_active', true)
        .order('name')
    : { data: [] }

  // Get lead stats based on role
  let statsQuery = supabase
    .from('leads')
    .select('status')
    .eq('is_deleted', false)

  // Non-admin users only see stats for leads they've connected with
  if (!isAdmin) {
    statsQuery = statsQuery
      .eq('owner_id', user?.id)
      .in('status', ['contacted', 'qualified', 'converted', 'lost'])
  }

  const { data: stats } = await statsQuery

  const leadStats = {
    total: stats?.length || 0,
    new: stats?.filter(l => l.status === 'new').length || 0,
    contacted: stats?.filter(l => l.status === 'contacted').length || 0,
    qualified: stats?.filter(l => l.status === 'qualified').length || 0,
    converted: stats?.filter(l => l.status === 'converted').length || 0,
  }

  return (
    <div className="space-y-6">
      {/* Header - only show import button for admins */}
      {isAdmin && (
        <LeadsHeader
          users={users || []}
          campaigns={campaigns || []}
          currentUserId={user?.id}
        />
      )}

      {/* Page Title for non-admins */}
      {!isAdmin && (
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            <span className="text-gold-gradient font-semibold">MY LEADS</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Leads you've connected with through calls
          </p>
        </div>
      )}

      {/* Stats */}
      <div className={`grid gap-4 ${isAdmin ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
        <StatCard label="Total" value={leadStats.total} icon={Users} />
        {isAdmin && <StatCard label="New" value={leadStats.new} icon={UserPlus} color="blue" />}
        <StatCard label="Contacted" value={leadStats.contacted} icon={Phone} color="yellow" />
        <StatCard label="Qualified" value={leadStats.qualified} icon={CheckCircle} color="green" />
        <StatCard label="Converted" value={leadStats.converted} icon={ArrowRight} color="purple" />
      </div>

      {/* Lead Groups - shown for everyone */}
      <LeadImportGroups />
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
