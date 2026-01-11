import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System group identifiers
const SYSTEM_GROUPS = {
  AI_GENERATED: 'ai-generated',
  INDIVIDUALLY_ADDED: 'individually-added',
}

/**
 * Ensure system groups exist for an organization
 */
async function ensureSystemGroups(organizationId: string) {
  const admin = getSupabaseAdmin()

  // Check if AI Generated group exists
  const { data: aiGroup } = await admin
    .from('lead_import_jobs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_system', true)
    .eq('file_name', SYSTEM_GROUPS.AI_GENERATED)
    .single()

  if (!aiGroup) {
    await admin.from('lead_import_jobs').insert({
      file_name: SYSTEM_GROUPS.AI_GENERATED,
      display_name: 'AI Generated',
      organization_id: organizationId,
      is_system: true,
      status: 'completed',
      field_mapping: {},
    })
  }

  // Check if Individually Added group exists
  const { data: manualGroup } = await admin
    .from('lead_import_jobs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_system', true)
    .eq('file_name', SYSTEM_GROUPS.INDIVIDUALLY_ADDED)
    .single()

  if (!manualGroup) {
    await admin.from('lead_import_jobs').insert({
      file_name: SYSTEM_GROUPS.INDIVIDUALLY_ADDED,
      display_name: 'Individually Added',
      organization_id: organizationId,
      is_system: true,
      status: 'completed',
      field_mapping: {},
    })
  }
}

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

    // Get user info
    const { data: userData } = await getSupabaseAdmin()
      .from('users')
      .select('id, role, organization_id')
      .or(`auth_user_id.eq.${user.id},auth_id.eq.${user.id}`)
      .single()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isAdmin = userData.role === 'admin' || userData.role === 'manager'

    // Ensure system groups exist
    await ensureSystemGroups(userData.organization_id)

    // Get all import jobs for this organization
    const { data: importJobs, error: jobsError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('id, file_name, display_name, is_system, successful_rows, created_at, status')
      .eq('organization_id', userData.organization_id)
      .eq('status', 'completed')
      .order('is_system', { ascending: false }) // System groups first
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('[Lead Groups] Error fetching jobs:', jobsError)
      return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
    }

    // For each group, get lead counts (filtered by role)
    const groupsWithCounts = await Promise.all(
      (importJobs || []).map(async (job) => {
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

        // Also get turbo queue count if admin
        let queuedCount = 0
        if (isAdmin) {
          const { data: leads } = await getSupabaseAdmin()
            .from('leads')
            .select('id')
            .eq('import_job_id', job.id)
            .eq('is_deleted', false)
            .not('phone', 'is', null)

          const leadIds = leads?.map(l => l.id) || []

          if (leadIds.length > 0) {
            const { count: queued } = await getSupabaseAdmin()
              .from('turbo_call_queue')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', userData.organization_id)
              .eq('status', 'queued')
              .in('lead_id', leadIds)

            queuedCount = queued || 0
          }
        }

        return {
          id: job.id,
          name: job.display_name || job.file_name.replace(/\.csv$/i, ''),
          file_name: job.file_name,
          is_system: job.is_system || false,
          lead_count: count || 0,
          queued_count: queuedCount,
          is_turbo_enabled: queuedCount > 0,
          created_at: job.created_at,
        }
      })
    )

    // For non-admins, filter out groups with 0 leads
    const filteredGroups = isAdmin
      ? groupsWithCounts
      : groupsWithCounts.filter(g => g.lead_count > 0)

    return NextResponse.json({
      groups: filteredGroups,
      isAdmin,
    })
  } catch (error) {
    console.error('[Lead Groups] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
