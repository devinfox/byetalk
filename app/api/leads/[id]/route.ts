import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role for deletions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const { data: lead, error: findError } = await supabase
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
    await supabase
      .from('calls')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 2. Clear tasks
    await supabase
      .from('tasks')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 3. Clear deals (set lead_id to null, don't delete the deal)
    await supabase
      .from('deals')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 4. Clear emails
    await supabase
      .from('emails')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 5. Clear email_drafts
    await supabase
      .from('email_drafts')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 6. Clear form_submissions
    await supabase
      .from('form_submissions')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 7. Clear activity_log
    await supabase
      .from('activity_log')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 8. Clear notes
    await supabase
      .from('notes')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 9. Clear system_events
    await supabase
      .from('system_events')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 10. Clear documents
    await supabase
      .from('documents')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // 11. Clear lead duplicate references
    await supabase
      .from('leads')
      .update({ duplicate_of_lead_id: null })
      .eq('duplicate_of_lead_id', leadId)

    // 12. Clear contacts that reference this lead
    await supabase
      .from('contacts')
      .update({ lead_id: null })
      .eq('lead_id', leadId)

    // Now delete the lead
    const { error: deleteError } = await supabase
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
