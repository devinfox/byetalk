import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { DealsCardsView } from './deals-cards-view'
import { CreateDealButton } from './create-deal-button'
import { Target, DollarSign, TrendingUp, Trophy } from 'lucide-react'

export default async function DealsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  // Build query based on user role
  let query = supabase
    .from('deals')
    .select(`
      *,
      owner:users!deals_owner_id_fkey(id, first_name, last_name),
      lead:leads!deals_lead_id_fkey(id, first_name, last_name, email, phone),
      campaign:campaigns(id, name, code)
    `)
    .eq('is_deleted', false)
    .order('stage_entered_at', { ascending: false })

  // If not manager/admin, only show own deals
  if (user?.role === 'sales_rep' || user?.role === 'senior_rep' || user?.role === 'closer') {
    query = query.or(`owner_id.eq.${user.id},secondary_owner_id.eq.${user.id}`)
  }

  const { data: deals } = await query.limit(200)

  // Get users for assignment dropdown
  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name, role')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .in('role', ['sales_rep', 'senior_rep', 'closer'])
    .order('first_name')

  // Get leads for deal creation
  const { data: leads } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email')
    .eq('is_deleted', false)
    .order('last_name')
    .limit(100)

  // Get campaigns for dropdown
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, code')
    .eq('is_deleted', false)
    .eq('is_active', true)
    .order('name')

  // Calculate pipeline stats
  const openDeals = deals?.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost') || []
  const closedWonDeals = deals?.filter(d => d.stage === 'closed_won') || []

  const pipelineStats = {
    total_deals: openDeals.length,
    total_value: openDeals.reduce((sum, d) => sum + (d.estimated_value || 0), 0),
    funded_value: closedWonDeals.reduce((sum, d) => sum + (d.funded_amount || d.estimated_value || 0), 0),
    won_deals: closedWonDeals.length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            MY <span className="text-gold-gradient font-semibold">DEALS</span>
          </h1>
          <p className="text-gray-400 mt-1">Track and close your deals</p>
        </div>
        <CreateDealButton
          users={users || []}
          leads={leads || []}
          campaigns={campaigns || []}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Open Deals"
          value={pipelineStats.total_deals.toString()}
          icon={Target}
        />
        <StatCard
          label="Pipeline Value"
          value={formatCurrency(pipelineStats.total_value)}
          icon={TrendingUp}
          isGold
        />
        <StatCard
          label="Total Closed"
          value={formatCurrency(pipelineStats.funded_value)}
          icon={DollarSign}
          isGold
        />
        <StatCard
          label="Deals Won"
          value={pipelineStats.won_deals.toString()}
          icon={Trophy}
        />
      </div>

      {/* Deals Cards */}
      <DealsCardsView
        deals={deals || []}
        currentUser={user}
      />
    </div>
  )
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function StatCard({
  label,
  value,
  icon: Icon,
  isGold = false
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  isGold?: boolean
}) {
  return (
    <div className="glass-card p-5 text-center">
      <div className="flex items-center justify-center mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isGold ? 'bg-yellow-500/20' : 'bg-white/10'}`}>
          <Icon className={`w-5 h-5 ${isGold ? 'text-yellow-400' : 'text-gray-400'}`} />
        </div>
      </div>
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${isGold ? 'text-gold-gradient' : 'text-white'}`}>{value}</p>
    </div>
  )
}
