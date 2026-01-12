import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System group identifiers
const SYSTEM_GROUPS = {
  AI_GENERATED: 'ai-generated',
  INDIVIDUALLY_ADDED: 'individually-added',
}

/**
 * Get or create a system import group for an organization
 */
async function getSystemGroup(organizationId: string, groupType: 'ai-generated' | 'individually-added') {
  const admin = getSupabaseAdmin()

  // Check if group exists
  const { data: existingGroup } = await admin
    .from('lead_import_jobs')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_system', true)
    .eq('file_name', groupType)
    .single()

  if (existingGroup) {
    return existingGroup.id
  }

  // Create the group
  const displayName = groupType === 'ai-generated' ? 'AI Generated' : 'Individually Added'
  const { data: newGroup, error } = await admin
    .from('lead_import_jobs')
    .insert({
      file_name: groupType,
      display_name: displayName,
      organization_id: organizationId,
      is_system: true,
      status: 'completed',
      field_mapping: {},
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Leads API] Error creating system group:', error)
    throw new Error('Failed to create system group')
  }

  return newGroup.id
}

// GET /api/leads - Get leads with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const hasEmail = searchParams.get('hasEmail') === 'true'
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Use service role for querying
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = serviceClient
      .from('leads')
      .select('id, first_name, last_name, email, phone, status, source_type, ai_tags, created_at')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filter by email presence
    if (hasEmail) {
      query = query.not('email', 'is', null)
    }

    const { data: leads, error: leadsError } = await query

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json({ error: leadsError.message }, { status: 500 })
    }

    return NextResponse.json({ data: leads || [] })
  } catch (error) {
    console.error('Error in GET /api/leads:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/leads
 * Create a new lead (manually added or AI-generated)
 */
export async function POST(request: NextRequest) {
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
      console.error('[Leads API] User not found for auth ID:', user.id)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      first_name,
      last_name,
      email,
      phone,
      city,
      state,
      source_type,
      campaign_id,
      notes,
      owner_id,
      is_ai_generated = false, // Flag for Nimbus-created leads
    } = body

    // Get the appropriate system group
    const groupType = is_ai_generated ? SYSTEM_GROUPS.AI_GENERATED : SYSTEM_GROUPS.INDIVIDUALLY_ADDED
    const importJobId = await getSystemGroup(userData.organization_id, groupType as 'ai-generated' | 'individually-added')

    // Create the lead - owner_id is null unless explicitly provided
    // Leads get assigned to reps when they connect (autodialer or inbound call)
    const { data: lead, error: insertError } = await getSupabaseAdmin()
      .from('leads')
      .insert({
        first_name: first_name || null,
        last_name: last_name || null,
        email: email || null,
        phone: phone ? phone.replace(/\D/g, '').slice(-10) : null,
        city: city || null,
        state: state || null,
        source_type: source_type || (is_ai_generated ? 'inbound_call' : null),
        campaign_id: campaign_id || null,
        owner_id: owner_id || null, // Unassigned by default - assigned when rep connects
        assigned_at: owner_id ? new Date().toISOString() : null,
        notes: notes || null,
        status: 'new',
        import_job_id: importJobId,
        organization_id: userData.organization_id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Leads API] Error creating lead:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('[Leads API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
