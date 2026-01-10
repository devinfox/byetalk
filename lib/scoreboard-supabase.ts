import { createClient } from '@supabase/supabase-js'

// Connect to the CRM's Supabase instance
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type SalesRep = {
  id: string
  name: string
  weeklyRevenue: number
  dailyTransfers: number
  weeklyTransfers: number
  avatarImage: string
}

// Default gladiator avatars
const DEFAULT_AVATARS = ['/guy-1.png', '/guy-2.png', '/guy-3.png']

// Get a deterministic "random" avatar based on user ID
function getDefaultAvatar(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const index = Math.abs(hash) % DEFAULT_AVATARS.length
  return DEFAULT_AVATARS[index]
}

export async function fetchSalesReps(): Promise<SalesRep[]> {
  // Fetch from local API route
  try {
    const response = await fetch('/api/scoreboard')
    if (response.ok) {
      return await response.json()
    }
  } catch (error) {
    console.error('Error fetching from local API:', error)
  }

  // Fallback: fetch directly from Supabase (may have limited data due to RLS)
  console.warn('Falling back to direct Supabase fetch')

  // Get current week boundaries (Monday-Friday)
  const now = new Date()
  const startOfWeek = new Date(now)
  const dayOfWeek = now.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  startOfWeek.setDate(now.getDate() - daysFromMonday)
  startOfWeek.setHours(0, 0, 0, 0)
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  const { data: users } = await supabase
    .from('users')
    .select('id, first_name, last_name, gladiator_avatar, role')
    .eq('is_active', true)
    .in('role', ['sales_rep', 'senior_rep', 'closer', 'manager', 'admin'])

  const { data: deals } = await supabase
    .from('deals')
    .select('id, owner_id, secondary_owner_id, funded_amount, estimated_value, closed_at')
    .eq('stage', 'closed_won')
    .eq('is_deleted', false)
    .gte('closed_at', startOfWeek.toISOString())

  const { data: weeklyCalls } = await supabase
    .from('calls')
    .select('id, user_id')
    .eq('is_deleted', false)
    .eq('disposition', 'answered')
    .gte('started_at', startOfWeek.toISOString())

  const { data: dailyCalls } = await supabase
    .from('calls')
    .select('id, user_id')
    .eq('is_deleted', false)
    .eq('disposition', 'answered')
    .gte('started_at', startOfDay.toISOString())

  const salesReps: SalesRep[] = (users || []).map(user => {
    const userDeals = (deals || []).filter(
      d => d.owner_id === user.id || d.secondary_owner_id === user.id
    )
    const weeklyRevenue = userDeals.reduce(
      (sum, d) => sum + (d.funded_amount || d.estimated_value || 0),
      0
    )
    const userWeeklyCalls = (weeklyCalls || []).filter(c => c.user_id === user.id)
    const userDailyCalls = (dailyCalls || []).filter(c => c.user_id === user.id)
    const avatarImage = user.gladiator_avatar || getDefaultAvatar(user.id)

    return {
      id: user.id,
      name: `${user.first_name} ${user.last_name}`,
      weeklyRevenue,
      dailyTransfers: userDailyCalls.length,
      weeklyTransfers: userWeeklyCalls.length,
      avatarImage,
    }
  })

  return salesReps.sort((a, b) => b.weeklyRevenue - a.weeklyRevenue)
}
