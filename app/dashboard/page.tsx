import { createClient, getCurrentUser } from '@/lib/supabase-server'
import Link from 'next/link'
import {
  DollarSign,
  Trophy,
  PhoneForwarded,
  CheckSquare,
  TrendingUp,
  Mail,
  ArrowRight,
  Inbox,
} from 'lucide-react'

// Format currency
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

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  // Fetch user's deals for stats
  let dealsQuery = supabase
    .from('deals')
    .select('*')
    .eq('is_deleted', false)

  // If not manager/admin, only show own deals
  if (user?.role === 'sales_rep' || user?.role === 'senior_rep' || user?.role === 'closer') {
    dealsQuery = dealsQuery.or(`owner_id.eq.${user.id},secondary_owner_id.eq.${user.id}`)
  }

  const { data: deals } = await dealsQuery

  // Calculate stats from deals
  const closedWonDeals = deals?.filter(d => d.stage === 'closed_won') || []
  const openDeals = deals?.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost') || []

  const totalRevenue = closedWonDeals.reduce(
    (sum, d) => sum + (d.funded_amount || d.estimated_value || 0),
    0
  )
  const dealsWonCount = closedWonDeals.length
  const activePipelineValue = openDeals.reduce(
    (sum, d) => sum + (d.estimated_value || 0),
    0
  )
  const activePipelineCount = openDeals.length

  // Get today's stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const todayClosedDeals = closedWonDeals.filter(d =>
    d.closed_at && new Date(d.closed_at) >= today
  )
  const revenueToday = todayClosedDeals.reduce(
    (sum, d) => sum + (d.funded_amount || d.estimated_value || 0),
    0
  )

  const newDealsToday = deals?.filter(d =>
    d.created_at && new Date(d.created_at) >= today
  ).length || 0

  // Fetch unread emails (first 5)
  const { data: unreadEmails } = await supabase
    .from('emails')
    .select(`
      id,
      thread_id,
      subject,
      from_address,
      from_name,
      created_at
    `)
    .eq('is_read', false)
    .eq('is_inbound', true)
    .order('created_at', { ascending: false })
    .limit(5)

  // TODO: Fetch outstanding tasks count when tasks feature is implemented
  const outstandingTasks = 0

  // TODO: Transfer overs will be tracked through phone calls
  const transferOvers = 0
  const tosToday = 0

  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            WELCOME, <span className="text-gold-gradient font-semibold">{user?.first_name?.toUpperCase()} {user?.last_name?.toUpperCase()}.</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Here&apos;s your performance overview for {currentYear}.
          </p>
        </div>
        <div className="text-4xl font-light text-yellow-400/50">{currentYear}</div>
      </div>

      {/* Top Stats - 5 Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Revenue */}
        <div className="glass-card p-5 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Revenue</p>
          <p className="text-2xl font-bold text-gold-gradient">{formatCurrency(totalRevenue)}</p>
        </div>

        {/* Deals Won */}
        <div className="glass-card p-5 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Deals Won</p>
          <p className="text-2xl font-bold text-white">{dealsWonCount}</p>
        </div>

        {/* Transfer Overs */}
        <div className="glass-card p-5 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <PhoneForwarded className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Transfer Overs</p>
          <p className="text-2xl font-bold text-white">{transferOvers}</p>
        </div>

        {/* Outstanding Tasks */}
        <div className="glass-card p-5 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Tasks</p>
          <p className="text-2xl font-bold text-white">{outstandingTasks}</p>
        </div>

        {/* Active Pipeline */}
        <div className="glass-card p-5 text-center">
          <div className="flex items-center justify-center mb-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Active Pipeline</p>
          <p className="text-2xl font-bold text-gold-gradient">{formatCurrency(activePipelineValue)}</p>
          <p className="text-gray-500 text-xs mt-1">{activePipelineCount} deals</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Inbox Preview */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Inbox</h2>
            </div>
            <Link href="/dashboard/email" className="text-yellow-400 hover:text-yellow-300 text-sm flex items-center gap-1">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {unreadEmails && unreadEmails.length > 0 ? (
            <div className="space-y-2">
              {unreadEmails.map((email) => (
                <Link
                  key={email.id}
                  href={`/dashboard/email/${email.thread_id}`}
                  className="block glass-card-subtle p-3 hover:bg-white/10 transition-colors rounded-xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {email.from_name || email.from_address}
                      </p>
                      <p className="text-gray-400 text-xs truncate">
                        {email.subject || '(No subject)'}
                      </p>
                    </div>
                    <span className="text-gray-500 text-xs flex-shrink-0">
                      {email.created_at
                        ? new Date(email.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No unread emails</p>
              <p className="text-gray-600 text-xs mt-1">You&apos;re all caught up!</p>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Daily Activity Snapshot */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide mb-4">Today&apos;s Activity</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-yellow-400" />
                  </div>
                  <span className="text-gray-400">Revenue Today</span>
                </div>
                <span className="text-yellow-400 font-bold text-lg">{formatCurrency(revenueToday)}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-gray-400">New Deals Today</span>
                </div>
                <span className="text-white font-bold text-lg">{newDealsToday}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <PhoneForwarded className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-gray-400">TOs Today</span>
                </div>
                <span className="text-white font-bold text-lg">{tosToday}</span>
              </div>
            </div>
          </div>

          {/* All-Time Performance */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide mb-4">All-Time Performance</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Revenue</span>
                <span className="text-yellow-400 font-bold">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Deals Won</span>
                <span className="text-white font-bold">{dealsWonCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Transfer Overs</span>
                <span className="text-white font-bold">{transferOvers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Average Deal Size</span>
                <span className="text-yellow-400 font-bold">
                  {dealsWonCount > 0 ? formatCurrency(totalRevenue / dealsWonCount) : '$0'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
