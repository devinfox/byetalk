import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/turbo/queue/import-job
 * Get import jobs with turbo queue status for admin turbo management
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user and check if admin/manager - try auth_user_id first, then fall back to auth_id
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

    if (userData.role !== 'admin' && userData.role !== 'manager') {
      return NextResponse.json({ error: 'Only admins and managers can manage turbo groups' }, { status: 403 })
    }

    // Get all import jobs with lead counts
    const { data: importJobs, error: jobsError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('id, file_name, successful_rows, created_at, status')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50)

    if (jobsError) {
      console.error('[Turbo Import Jobs] Error fetching jobs:', jobsError)
      return NextResponse.json({ error: 'Failed to fetch import jobs' }, { status: 500 })
    }

    // For each job, get the count of leads with phones and how many are in turbo queue
    const jobsWithStats = await Promise.all(
      (importJobs || []).map(async (job) => {
        // Get leads with phones for this import job
        const { data: leads } = await getSupabaseAdmin()
          .from('leads')
          .select('id')
          .eq('import_job_id', job.id)
          .eq('is_deleted', false)
          .not('phone', 'is', null)

        const leadIds = leads?.map(l => l.id) || []

        // Get how many of these leads are in turbo queue
        let queuedCount = 0
        if (leadIds.length > 0) {
          const { count } = await getSupabaseAdmin()
            .from('turbo_call_queue')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', userData.organization_id)
            .eq('status', 'queued')
            .in('lead_id', leadIds)

          queuedCount = count || 0
        }

        return {
          ...job,
          lead_count: leadIds.length,
          queued_count: queuedCount,
          is_turbo_enabled: queuedCount > 0,
        }
      })
    )

    // Filter to only jobs that have leads with phones
    const validJobs = jobsWithStats.filter(job => job.lead_count > 0)

    return NextResponse.json({ jobs: validJobs })
  } catch (error) {
    console.error('[Turbo Import Jobs] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/turbo/queue/import-job
 * Enable turbo mode for all leads in an import job
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { import_job_id } = body

    if (!import_job_id) {
      return NextResponse.json({ error: 'import_job_id required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user and check if admin/manager - try auth_user_id first, then fall back to auth_id
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

    if (userData.role !== 'admin' && userData.role !== 'manager') {
      return NextResponse.json({ error: 'Only admins and managers can manage turbo groups' }, { status: 403 })
    }

    // Get all leads from this import job with phone numbers
    const { data: leads, error: leadsError } = await getSupabaseAdmin()
      .from('leads')
      .select('id')
      .eq('import_job_id', import_job_id)
      .eq('is_deleted', false)
      .not('phone', 'is', null)

    if (leadsError) {
      console.error('[Turbo Import Jobs] Error fetching leads:', leadsError)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: 'No leads with phone numbers in this import' }, { status: 400 })
    }

    // Add all leads to turbo queue
    const queueItems = leads.map(lead => ({
      organization_id: userData.organization_id,
      lead_id: lead.id,
      priority: 0,
      added_by: userData.id,
      status: 'queued',
      added_at: new Date().toISOString(),
    }))

    const { error: insertError } = await getSupabaseAdmin()
      .from('turbo_call_queue')
      .upsert(queueItems, {
        onConflict: 'organization_id,lead_id',
        ignoreDuplicates: false,
      })

    if (insertError) {
      console.error('[Turbo Import Jobs] Error adding to queue:', insertError)
      return NextResponse.json({ error: 'Failed to add leads to queue' }, { status: 500 })
    }

    console.log(`[Turbo Import Jobs] Added ${leads.length} leads from import ${import_job_id} to turbo queue`)

    return NextResponse.json({
      success: true,
      added: leads.length,
      import_job_id,
    })
  } catch (error) {
    console.error('[Turbo Import Jobs] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/turbo/queue/import-job
 * Disable turbo mode for all leads in an import job
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const importJobId = searchParams.get('import_job_id')

    if (!importJobId) {
      return NextResponse.json({ error: 'import_job_id required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user and check if admin/manager - try auth_user_id first, then fall back to auth_id
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

    if (userData.role !== 'admin' && userData.role !== 'manager') {
      return NextResponse.json({ error: 'Only admins and managers can manage turbo groups' }, { status: 403 })
    }

    // Get all leads from this import job
    const { data: leads } = await getSupabaseAdmin()
      .from('leads')
      .select('id')
      .eq('import_job_id', importJobId)
      .eq('is_deleted', false)

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, removed: 0 })
    }

    const leadIds = leads.map(l => l.id)

    // Remove all these leads from turbo queue
    const { error: deleteError } = await getSupabaseAdmin()
      .from('turbo_call_queue')
      .delete()
      .eq('organization_id', userData.organization_id)
      .in('lead_id', leadIds)

    if (deleteError) {
      console.error('[Turbo Import Jobs] Error removing from queue:', deleteError)
      return NextResponse.json({ error: 'Failed to remove leads from queue' }, { status: 500 })
    }

    console.log(`[Turbo Import Jobs] Removed ${leads.length} leads from import ${importJobId} from turbo queue`)

    return NextResponse.json({
      success: true,
      removed: leads.length,
      import_job_id: importJobId,
    })
  } catch (error) {
    console.error('[Turbo Import Jobs] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
