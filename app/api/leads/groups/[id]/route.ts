import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * DELETE /api/leads/groups/[id]
 * Delete a lead import group and all its leads
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[Delete Group] Starting delete request')

  try {
    const { id: groupId } = await params

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 })
    }

    console.log('[Delete Group] Group ID:', groupId)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const { data: userData } = await getSupabaseAdmin()
      .from('users')
      .select('id, role, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (!userData) {
      console.log('[Delete Group] User not found for auth id:', user.id)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only admins/managers can delete groups
    if (userData.role !== 'admin' && userData.role !== 'manager') {
      return NextResponse.json({ error: 'Only admins can delete lead groups' }, { status: 403 })
    }

    // Check if the group exists
    const { data: group, error: groupError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('id, file_name, is_system')
      .eq('id', groupId)
      .single()

    if (groupError || !group) {
      console.log('[Delete Group] Group not found:', groupError)
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Don't allow deleting system groups
    if (group.is_system) {
      return NextResponse.json({ error: 'Cannot delete system groups' }, { status: 400 })
    }

    // Get all leads in this group
    const { data: leads } = await getSupabaseAdmin()
      .from('leads')
      .select('id')
      .eq('import_job_id', groupId)

    const leadIds = leads?.map(l => l.id) || []
    console.log('[Delete Group] Found', leadIds.length, 'leads to delete')

    if (leadIds.length > 0) {
      // Delete in order of dependencies
      // 1. First delete from tables with NOT NULL foreign keys (must delete, can't set null)

      console.log('[Delete Group] Removing turbo queue items...')
      await getSupabaseAdmin()
        .from('turbo_call_queue')
        .delete()
        .in('lead_id', leadIds)

      console.log('[Delete Group] Removing turbo active calls...')
      await getSupabaseAdmin()
        .from('turbo_active_calls')
        .delete()
        .in('lead_id', leadIds)

      // 2. Set NULL on tables that allow it
      console.log('[Delete Group] Clearing references in related tables...')

      const tablesToClear = [
        'calls',
        'tasks',
        'deals',
        'emails',
        'email_drafts',
        'email_threads',
        'form_submissions',
        'activity_log',
        'notes',
        'system_events',
        'documents',
        'contacts',
        'presentations',
        'video_meetings'
      ]

      for (const table of tablesToClear) {
        try {
          await getSupabaseAdmin()
            .from(table)
            .update({ lead_id: null })
            .in('lead_id', leadIds)
        } catch (e) {
          // Table might not exist or not have lead_id column - that's ok
          console.log(`[Delete Group] Skipped ${table}`)
        }
      }

      // 3. Clear self-references in leads table
      console.log('[Delete Group] Clearing duplicate references...')
      await getSupabaseAdmin()
        .from('leads')
        .update({ duplicate_of_lead_id: null })
        .in('duplicate_of_lead_id', leadIds)

      // 4. Now delete the leads
      console.log('[Delete Group] Deleting leads...')
      const { error: leadsDeleteError } = await getSupabaseAdmin()
        .from('leads')
        .delete()
        .eq('import_job_id', groupId)

      if (leadsDeleteError) {
        console.error('[Delete Group] Error deleting leads:', leadsDeleteError)
        return NextResponse.json(
          { error: 'Failed to delete leads in group', details: leadsDeleteError.message },
          { status: 500 }
        )
      }
    }

    // Delete import errors for this job
    console.log('[Delete Group] Deleting import errors...')
    await getSupabaseAdmin()
      .from('lead_import_errors')
      .delete()
      .eq('import_job_id', groupId)

    // Delete the import job itself
    console.log('[Delete Group] Deleting import job...')
    const { error: groupDeleteError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .delete()
      .eq('id', groupId)

    if (groupDeleteError) {
      console.error('[Delete Group] Error deleting group:', groupDeleteError)
      return NextResponse.json(
        { error: 'Failed to delete group', details: groupDeleteError.message },
        { status: 500 }
      )
    }

    console.log('[Delete Group] Success! Deleted group and', leadIds.length, 'leads')

    return NextResponse.json({
      success: true,
      message: `Group and ${leadIds.length} leads have been permanently deleted`,
      deletedLeads: leadIds.length,
    })
  } catch (error) {
    console.error('[Delete Group] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
