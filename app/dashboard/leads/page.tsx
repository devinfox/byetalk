import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { LeadsHeader } from './leads-header'
import { LeadImportGroups } from './lead-import-groups'
import { SalesRepLeadHeader } from './sales-rep-lead-header'
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

  // Get campaigns for dropdown
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, code')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('name')

  // Get lead stats based on role using COUNT queries (not limited to 1000)
  let leadStats = { total: 0, new: 0, contacted: 0, qualified: 0, converted: 0 }

  if (isAdmin) {
    // Admin sees all leads - use count queries
    const [totalResult, newResult, contactedResult, qualifiedResult, convertedResult] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('status', 'new'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('status', 'contacted'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('status', 'qualified'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('status', 'converted'),
    ])

    leadStats = {
      total: totalResult.count || 0,
      new: newResult.count || 0,
      contacted: contactedResult.count || 0,
      qualified: qualifiedResult.count || 0,
      converted: convertedResult.count || 0,
    }
  } else {
    // Non-admin users see stats for leads they own (including new ones they manually created)
    const [totalResult, newResult, contactedResult, qualifiedResult, convertedResult] = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true })
        .eq('is_deleted', false).eq('owner_id', user?.id)
        .in('status', ['new', 'contacted', 'qualified', 'converted', 'lost']),
      supabase.from('leads').select('*', { count: 'exact', head: true })
        .eq('is_deleted', false).eq('owner_id', user?.id).eq('status', 'new'),
      supabase.from('leads').select('*', { count: 'exact', head: true })
        .eq('is_deleted', false).eq('owner_id', user?.id).eq('status', 'contacted'),
      supabase.from('leads').select('*', { count: 'exact', head: true })
        .eq('is_deleted', false).eq('owner_id', user?.id).eq('status', 'qualified'),
      supabase.from('leads').select('*', { count: 'exact', head: true })
        .eq('is_deleted', false).eq('owner_id', user?.id).eq('status', 'converted'),
    ])

    leadStats = {
      total: totalResult.count || 0,
      new: newResult.count || 0,
      contacted: contactedResult.count || 0,
      qualified: qualifiedResult.count || 0,
      converted: convertedResult.count || 0,
    }
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

      {/* Page Title and Add Lead for non-admins */}
      {!isAdmin && (
        <SalesRepLeadHeader
          campaigns={campaigns || []}
          currentUserId={user?.id}
        />
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
