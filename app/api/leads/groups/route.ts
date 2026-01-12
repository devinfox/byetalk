import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/leads/groups
 * Get all lead import groups for the current user
 * - Admins/managers see all groups with all leads
 * - Sales reps see groups only if they have connected leads in them
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user info - try auth_user_id first, then fall back to auth_id
    let userData = null
    const { data: userByAuthUserId } = await getSupabaseAdmin()
      .from('users')
      .select('id, role, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await getSupabaseAdmin()
        .from('users')
        .select('id, role, organization_id')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isAdmin = userData.role === 'admin' || userData.role === 'manager'

    // Get all import jobs for this organization
    // Using a simpler query that works whether migration is run or not
    const { data: importJobs, error: jobsError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('id, file_name, display_name, is_system, successful_rows, created_at, status')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50)

    if (jobsError) {
      console.error('[Lead Groups] Error fetching jobs:', jobsError)
      // If error is about missing column, return empty groups
      if (jobsError.message?.includes('column') || jobsError.message?.includes('does not exist')) {
        return NextResponse.json({ groups: [], isAdmin })
      }
      return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
    }

    if (!importJobs || importJobs.length === 0) {
      return NextResponse.json({ groups: [], isAdmin })
    }

    // Filter by organization if needed (admins see everything)
    const orgJobs = isAdmin
      ? importJobs
      : importJobs.filter(job =>
          // @ts-expect-error organization_id might not exist
          !job.organization_id || job.organization_id === userData.organization_id
        )

    // Get lead counts for each group more efficiently
    const groupsWithCounts = await Promise.all(
      orgJobs.map(async (job) => {
        try {
          let leadCountQuery = getSupabaseAdmin()
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('import_job_id', job.id)
            .eq('is_deleted', false)

          // For non-admins, only count leads they own AND have connected with
          if (!isAdmin) {
            leadCountQuery = leadCountQuery
              .eq('owner_id', userData.id)
              .in('status', ['contacted', 'qualified', 'converted', 'lost'])
          }

          const { count } = await leadCountQuery

          // Get turbo queue count for this group (for admins)
          let queuedCount = 0
          let isTurboEnabled = false
          if (isAdmin) {
            // Get lead IDs for this job
            const { data: jobLeads } = await getSupabaseAdmin()
              .from('leads')
              .select('id')
              .eq('import_job_id', job.id)
              .eq('is_deleted', false)
              .not('phone', 'is', null)

            const leadIds = jobLeads?.map(l => l.id) || []

            if (leadIds.length > 0) {
              const { count: turboCount } = await getSupabaseAdmin()
                .from('turbo_call_queue')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'queued')
                .in('lead_id', leadIds)

              queuedCount = turboCount || 0
              isTurboEnabled = queuedCount > 0
            }
          }

          return {
            id: job.id,
            name: job.display_name || job.file_name?.replace(/\.csv$/i, '') || 'Unnamed',
            file_name: job.file_name || '',
            is_system: job.is_system || false,
            lead_count: count || 0,
            queued_count: queuedCount,
            is_turbo_enabled: isTurboEnabled,
            created_at: job.created_at,
          }
        } catch (err) {
          console.error('[Lead Groups] Error getting lead count:', err)
          return null
        }
      })
    )

    // Filter out nulls and groups with 0 leads for non-admins
    const validGroups = groupsWithCounts.filter((g): g is NonNullable<typeof g> => g !== null)
    const filteredGroups = isAdmin
      ? validGroups
      : validGroups.filter(g => g.lead_count > 0)

    // For admins, add special groups
    if (isAdmin) {
      // Add "All Leads" group at the top
      const { count: allLeadsCount } = await getSupabaseAdmin()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('is_deleted', false)

      if (allLeadsCount && allLeadsCount > 0) {
        filteredGroups.unshift({
          id: 'all',
          name: 'All Leads',
          file_name: 'all-leads',
          is_system: true,
          lead_count: allLeadsCount,
          queued_count: 0,
          is_turbo_enabled: false,
          created_at: new Date().toISOString(),
        })
      }

      // Check for leads without an import_job_id (uncategorized)
      const { count: uncategorizedCount } = await getSupabaseAdmin()
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .is('import_job_id', null)
        .eq('is_deleted', false)

      if (uncategorizedCount && uncategorizedCount > 0) {
        filteredGroups.push({
          id: 'uncategorized',
          name: 'Uncategorized',
          file_name: 'uncategorized',
          is_system: true,
          lead_count: uncategorizedCount,
          queued_count: 0,
          is_turbo_enabled: false,
          created_at: new Date().toISOString(),
        })
      }
    }

    // Sort: system groups first (if they exist), then by date
    filteredGroups.sort((a, b) => {
      if (a.is_system && !b.is_system) return -1
      if (!a.is_system && b.is_system) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return NextResponse.json({
      groups: filteredGroups,
      isAdmin,
    })
  } catch (error) {
    console.error('[Lead Groups] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
