import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/leads/assign-on-answer
 * Assigns a lead to the rep who answered their inbound call
 * Only assigns if the lead is unassigned or status is 'new'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { leadId, userId } = await request.json()

    if (!leadId) {
      return NextResponse.json({ error: 'Lead ID required' }, { status: 400 })
    }

    // Get the lead's current status
    const { data: lead, error: leadError } = await getSupabaseAdmin()
      .from('leads')
      .select('id, owner_id, status, first_name, last_name')
      .eq('id', leadId)
      .eq('is_deleted', false)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Only assign if:
    // 1. Lead has no owner, OR
    // 2. Lead status is 'new' (hasn't been contacted yet)
    const shouldAssign = !lead.owner_id || lead.status === 'new'

    if (!shouldAssign) {
      // Lead already has an owner and has been contacted
      return NextResponse.json({
        success: true,
        assigned: false,
        reason: 'Lead already assigned and contacted',
        lead: {
          id: lead.id,
          name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          currentOwner: lead.owner_id,
        },
      })
    }

    // Assign the lead to the rep
    const updateData: Record<string, unknown> = {
      owner_id: userId,
      assigned_at: new Date().toISOString(),
    }

    // Update status to 'contacted' if it was 'new'
    if (lead.status === 'new') {
      updateData.status = 'contacted'
    }

    const { error: updateError } = await getSupabaseAdmin()
      .from('leads')
      .update(updateData)
      .eq('id', leadId)

    if (updateError) {
      console.error('[Assign on Answer] Error updating lead:', updateError)
      return NextResponse.json({ error: 'Failed to assign lead' }, { status: 500 })
    }

    console.log('[Assign on Answer] Lead assigned:', {
      leadId,
      leadName: `${lead.first_name} ${lead.last_name}`,
      assignedTo: userId,
      previousOwner: lead.owner_id,
      statusChange: lead.status === 'new' ? 'new -> contacted' : 'unchanged',
    })

    return NextResponse.json({
      success: true,
      assigned: true,
      lead: {
        id: lead.id,
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      },
    })
  } catch (error) {
    console.error('[Assign on Answer] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
