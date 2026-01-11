import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// DELETE /api/leads/[id] - Hard delete a lead
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID required' }, { status: 400 })
    }

    console.log('[Delete Lead] Starting hard delete for lead:', leadId)

    // First, check if the lead exists
    const { data: lead, error: findError } = await getSupabaseAdmin()
      .from('leads')
      .select('id, first_name, last_name')
      .eq('id', leadId)
      .single()

    if (findError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Clear lead_id references in related tables to avoid foreign key constraint violations
    // Order matters - clear references before deleting the lead

    // 1. Clear calls
    await getSupabaseAdmin()
      .from('calls')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 2. Clear tasks
    await getSupabaseAdmin()
      .from('tasks')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 3. Clear deals (set lead_id to null, don't delete the deal)
    await getSupabaseAdmin()
      .from('deals')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 4. Clear emails
    await getSupabaseAdmin()
      .from('emails')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 5. Clear email_drafts
    await getSupabaseAdmin()
      .from('email_drafts')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 6. Clear form_submissions
    await getSupabaseAdmin()
      .from('form_submissions')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 7. Clear activity_log
    await getSupabaseAdmin()
      .from('activity_log')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 8. Clear notes
    await getSupabaseAdmin()
      .from('notes')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 9. Clear system_events
    await getSupabaseAdmin()
      .from('system_events')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 10. Clear documents
    await getSupabaseAdmin()
      .from('documents')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 11. Clear lead duplicate references
    await getSupabaseAdmin()
      .from('leads')
      .update({ duplicate_of_lead_id: null })
      .eq('duplicate_of_lead_id', leadId)

    // 12. Clear contacts that reference this lead
    await getSupabaseAdmin()
      .from('contacts')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // Now delete the lead
    const { error: deleteError } = await getSupabaseAdmin()
      .from('leads')
      .delete()
      .eq('id', leadId)

    if (deleteError) {
      console.error('[Delete Lead] Error deleting lead:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete lead', details: deleteError.message },
        { status: 500 }
      )
    }

    console.log('[Delete Lead] Successfully deleted lead:', lead.first_name, lead.last_name)

    return NextResponse.json({
      success: true,
      message: `Lead ${lead.first_name} ${lead.last_name} has been permanently deleted`,
      deletedId: leadId,
    })
  } catch (error) {
    console.error('[Delete Lead] Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
