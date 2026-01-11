import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin client to bypass RLS for queue operations
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/turbo/queue/add
 * Add leads to the turbo call queue
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { lead_ids, priority = 0 } = body

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: 'lead_ids array required' }, { status: 400 })
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization (check both auth_user_id and auth_id) - use admin to bypass RLS
    let userData = null
    const { data: userByAuthUserId } = await supabaseAdmin
      .from('users')
      .select('id, organization_id')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await supabaseAdmin
        .from('users')
        .select('id, organization_id')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify leads exist and have phone numbers - use admin to bypass RLS
    const { data: validLeads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, phone')
      .in('id', lead_ids)
      .not('phone', 'is', null)
      .eq('is_deleted', false)

    if (leadsError) {
      console.error('[Turbo Queue] Error fetching leads:', leadsError)
      return NextResponse.json({ error: 'Failed to validate leads' }, { status: 500 })
    }

    if (!validLeads || validLeads.length === 0) {
      return NextResponse.json({ error: 'No valid leads with phone numbers' }, { status: 400 })
    }

    // Add leads to queue (upsert to handle re-adding leads)
    const queueItems = validLeads.map(lead => ({
      organization_id: userData.organization_id,
      lead_id: lead.id,
      priority,
      added_by: userData.id,
      status: 'queued',
      added_at: new Date().toISOString(),
    }))

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('turbo_call_queue')
      .upsert(queueItems, {
        onConflict: 'organization_id,lead_id',
        ignoreDuplicates: false, // Update existing rows to re-queue leads
      })
      .select('id')

    if (insertError) {
      console.error('[Turbo Queue] Error adding to queue:', insertError)
      return NextResponse.json({ error: 'Failed to add leads to queue' }, { status: 500 })
    }

    // Get updated queue count
    const { count } = await supabaseAdmin
      .from('turbo_call_queue')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', userData.organization_id)
      .eq('status', 'queued')

    console.log(`[Turbo Queue Add] User: ${userData.id}, Org: ${userData.organization_id}, Added ${validLeads.length} leads. Total queued: ${count}`)

    return NextResponse.json({
      success: true,
      added: validLeads.length,
      queue_size: count || 0,
      organization_id: userData.organization_id,
    })
  } catch (error) {
    console.error('[Turbo Queue] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
