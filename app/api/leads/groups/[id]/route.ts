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
  try {
    const { id: groupId } = await params

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 })
    }

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

    // Only admins/managers can delete groups
    const isAdmin = userData.role === 'admin' || userData.role === 'manager'
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admins can delete lead groups' }, { status: 403 })
    }

    // Check if the group exists
    const { data: group, error: groupError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('id, file_name, is_system')
      .eq('id', groupId)
      .single()

    if (groupError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Don't allow deleting system groups
    if (group.is_system) {
      return NextResponse.json({ error: 'Cannot delete system groups' }, { status: 400 })
    }

    console.log('[Delete Group] Starting deletion for group:', groupId)

    // Get all leads in this group
    const { data: leads } = await getSupabaseAdmin()
      .from('leads')
      .select('id')
      .eq('import_job_id', groupId)

    const leadIds = leads?.map(l => l.id) || []
    console.log('[Delete Group] Found', leadIds.length, 'leads to delete')

    if (leadIds.length > 0) {
      // Clear references in related tables for all leads in this group

      // Turbo queue items
      const { data: queueItems } = await getSupabaseAdmin()
        .from('turbo_call_queue')
        .select('id')
        .in('lead_id', leadIds)

      if (queueItems && queueItems.length > 0) {
        const queueIds = queueItems.map(q => q.id)
        await getSupabaseAdmin()
          .from('turbo_active_calls')
          .delete()
          .in('queue_item_id', queueIds)
      }

      await getSupabaseAdmin()
        .from('turbo_call_queue')
        .delete()
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('turbo_active_calls')
        .delete()
        .in('lead_id', leadIds)

      // Clear other references
      await getSupabaseAdmin()
        .from('calls')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('tasks')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('deals')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('emails')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('email_drafts')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('form_submissions')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('activity_log')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('notes')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('system_events')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('documents')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      await getSupabaseAdmin()
        .from('contacts')
        .update({ lead_id: null })
        .in('lead_id', leadIds)

      // Clear duplicate references
      await getSupabaseAdmin()
        .from('leads')
        .update({ duplicate_of_lead_id: null })
        .in('duplicate_of_lead_id', leadIds)

      // Delete all leads in this group
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
    await getSupabaseAdmin()
      .from('lead_import_errors')
      .delete()
      .eq('import_job_id', groupId)

    // Delete the import job itself
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

    console.log('[Delete Group] Successfully deleted group and', leadIds.length, 'leads')

    return NextResponse.json({
      success: true,
      message: `Group and ${leadIds.length} leads have been permanently deleted`,
      deletedLeads: leadIds.length,
    })
  } catch (error) {
    console.error('[Delete Group] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
