import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/turbo/queue/import-job
 * Enable turbo mode for all leads in an import job
 * Super simple: just add leads to queue
 */
export async function POST(request: NextRequest) {
  console.log('[Turbo Toggle] POST - Enable turbo')

  try {
    const supabase = await createClient()
    const body = await request.json()
    const { import_job_id } = body

    console.log('[Turbo Toggle] import_job_id:', import_job_id)

    if (!import_job_id) {
      return NextResponse.json({ error: 'import_job_id required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('[Turbo Toggle] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const { data: userData } = await getSupabaseAdmin()
      .from('users')
      .select('id, role, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (!userData) {
      console.log('[Turbo Toggle] User not found for auth id:', user.id)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('[Turbo Toggle] User:', userData.id, 'Role:', userData.role, 'Org:', userData.organization_id)

    // Get organization - create one if needed
    let orgId = userData.organization_id
    if (!orgId) {
      // Get or create default organization
      const { data: existingOrg } = await getSupabaseAdmin()
        .from('organizations')
        .select('id')
        .limit(1)
        .single()

      if (existingOrg) {
        orgId = existingOrg.id
      } else {
        // Create a default organization
        const { data: newOrg } = await getSupabaseAdmin()
          .from('organizations')
          .insert({ name: 'Default Organization', domain: 'default' })
          .select('id')
          .single()

        orgId = newOrg?.id
      }

      if (orgId) {
        // Update user with org
        await getSupabaseAdmin()
          .from('users')
          .update({ organization_id: orgId })
          .eq('id', userData.id)
      }
    }

    if (!orgId) {
      console.log('[Turbo Toggle] Could not get/create organization')
      return NextResponse.json({ error: 'Could not set up organization' }, { status: 500 })
    }

    console.log('[Turbo Toggle] Using organization:', orgId)

    // Get leads with phone numbers for this import job
    const { data: leads, error: leadsError } = await getSupabaseAdmin()
      .from('leads')
      .select('id, phone')
      .eq('import_job_id', import_job_id)
      .eq('is_deleted', false)
      .not('phone', 'is', null)

    console.log('[Turbo Toggle] Found leads:', leads?.length || 0, 'Error:', leadsError?.message)

    if (leadsError) {
      return NextResponse.json({ error: 'Failed to fetch leads: ' + leadsError.message }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: 'No leads with phone numbers found in this list' }, { status: 400 })
    }

    // Batch operations to handle unlimited leads
    const BATCH_SIZE = 500
    const leadIds = leads.map(l => l.id)

    // Clear existing queue items for these leads first (in batches)
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE)
      await getSupabaseAdmin()
        .from('turbo_call_queue')
        .delete()
        .in('lead_id', batch)
    }

    // Insert new queue items (in batches)
    let totalAdded = 0
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batchLeads = leads.slice(i, i + BATCH_SIZE)
      const queueItems = batchLeads.map(lead => ({
        organization_id: orgId,
        lead_id: lead.id,
        priority: 0,
        added_by: userData.id,
        status: 'queued' as const,
      }))

      const { error: insertError } = await getSupabaseAdmin()
        .from('turbo_call_queue')
        .insert(queueItems)

      if (insertError) {
        console.error('[Turbo Toggle] Batch insert error:', insertError)
      } else {
        totalAdded += queueItems.length
      }
    }

    console.log('[Turbo Toggle] Success! Added', totalAdded, 'leads to queue')

    return NextResponse.json({
      success: true,
      added: totalAdded,
      import_job_id,
    })
  } catch (error) {
    console.error('[Turbo Toggle] Unexpected error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error as Error).message }, { status: 500 })
  }
}

/**
 * DELETE /api/turbo/queue/import-job
 * Disable turbo mode for all leads in an import job
 */
export async function DELETE(request: NextRequest) {
  console.log('[Turbo Toggle] DELETE - Disable turbo')

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const importJobId = searchParams.get('import_job_id')

    console.log('[Turbo Toggle] import_job_id:', importJobId)

    if (!importJobId) {
      return NextResponse.json({ error: 'import_job_id required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete directly using a subquery approach - delete all queue items
    // where the lead belongs to this import job
    // This avoids the .in() array size limit
    const { data: leads } = await getSupabaseAdmin()
      .from('leads')
      .select('id')
      .eq('import_job_id', importJobId)
      .eq('is_deleted', false)

    console.log('[Turbo Toggle] Found leads to remove:', leads?.length || 0)

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, removed: 0 })
    }

    // Batch delete in chunks of 500 to avoid .in() limits
    const BATCH_SIZE = 500
    const leadIds = leads.map(l => l.id)
    let totalRemoved = 0

    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE)
      const { error: deleteError } = await getSupabaseAdmin()
        .from('turbo_call_queue')
        .delete()
        .in('lead_id', batch)

      if (deleteError) {
        console.error('[Turbo Toggle] Batch delete error:', deleteError)
      } else {
        totalRemoved += batch.length
      }
    }

    console.log('[Turbo Toggle] Success! Removed', totalRemoved, 'leads from queue')

    return NextResponse.json({
      success: true,
      removed: totalRemoved,
      import_job_id: importJobId,
    })
  } catch (error) {
    console.error('[Turbo Toggle] Unexpected error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error as Error).message }, { status: 500 })
  }
}
