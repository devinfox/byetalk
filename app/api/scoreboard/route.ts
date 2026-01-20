import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Default gladiator avatars
const DEFAULT_AVATARS = ['/guy-1.png', '/guy-2.png', '/guy-3.png']

// Users to exclude from scoreboard (admins/owners)
const EXCLUDED_NAMES = [
  'shaun bina',
  'devin fox',
  'johnathan carrington',
  'jonathan carrington',
  'john carrington',
  'jim bryan',
]


export type SalesRepData = {
  id: string
  name: string
  weeklyRevenue: number
  dailyTransfers: number
  weeklyTransfers: number
  avatarImage: string
}

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

export async function GET() {
  try {
    // Get all active users (employees)
    const { data: users, error: usersError } = await getSupabaseAdmin()
      .from('users')
      .select('id, first_name, last_name, gladiator_avatar, role')
      .eq('is_active', true)
      .in('role', ['sales_rep', 'senior_rep', 'closer', 'manager', 'admin'])

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    // Get current month and day boundaries
    const now = new Date()

    // Start of month = 1st day at 00:00:00
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    startOfMonth.setHours(0, 0, 0, 0)

    // Start of week for T.O's (Monday at 00:00:00)
    const startOfWeek = new Date(now)
    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startOfWeek.setDate(now.getDate() - daysFromMonday)
    startOfWeek.setHours(0, 0, 0, 0)

    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    // Get all closed_won deals this month
    const { data: deals, error: dealsError } = await getSupabaseAdmin()
      .from('deals')
      .select('id, owner_id, secondary_owner_id, funded_amount, estimated_value, closed_at')
      .eq('stage', 'closed_won')
      .eq('is_deleted', false)
      .gte('closed_at', startOfMonth.toISOString())

    if (dealsError) {
      console.error('Error fetching deals:', dealsError)
    }

    // Get transfer overs from calls (disposition = 'answered' and direction = 'inbound')
    // TODO: This should be based on actual transfer-over tracking if implemented
    const { data: weeklyCalls, error: callsError } = await getSupabaseAdmin()
      .from('calls')
      .select('id, user_id, started_at')
      .eq('is_deleted', false)
      .eq('disposition', 'answered')
      .gte('started_at', startOfWeek.toISOString())

    if (callsError) {
      console.error('Error fetching calls:', callsError)
    }

    const { data: dailyCalls } = await getSupabaseAdmin()
      .from('calls')
      .select('id, user_id, started_at')
      .eq('is_deleted', false)
      .eq('disposition', 'answered')
      .gte('started_at', startOfDay.toISOString())

    // Calculate stats for each user, excluding admins/owners
    const salesReps: SalesRepData[] = (users || [])
      .filter(user => {
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase()
        return !EXCLUDED_NAMES.includes(fullName)
      })
      .map(user => {
        // Calculate weekly revenue from deals where user is owner or secondary owner
        const userDeals = (deals || []).filter(
          d => d.owner_id === user.id || d.secondary_owner_id === user.id
        )
        const weeklyRevenue = userDeals.reduce(
          (sum, d) => sum + (d.funded_amount || d.estimated_value || 0),
          0
        )

        // Calculate transfer overs (calls answered)
        const userWeeklyCalls = (weeklyCalls || []).filter(c => c.user_id === user.id)
        const userDailyCalls = (dailyCalls || []).filter(c => c.user_id === user.id)

        // Use custom gladiator avatar or assign a default based on user ID
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

    // Sort by weekly revenue descending
    salesReps.sort((a, b) => b.weeklyRevenue - a.weeklyRevenue)

    return NextResponse.json(salesReps)
  } catch (error) {
    console.error('Scoreboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scoreboard data' },
      { status: 500 }
    )
  }
}
