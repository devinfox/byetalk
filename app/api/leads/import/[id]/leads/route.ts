import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const LEADS_PER_PAGE = 10

/**
 * GET /api/leads/import/[id]/leads
 * Get paginated leads for a specific import job
 * - Admins/managers see all leads in the group
 * - Sales reps see only leads they own AND have connected with (have a call record)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const isAdmin = userData.role === 'admin' || userData.role === 'manager'

    // Get query params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const search = searchParams.get('search') || ''

    // For non-admins, first get lead IDs they've connected with (have calls)
    let allowedLeadIds: string[] | null = null
    if (!isAdmin) {
      // Get leads this user owns that have at least one connected call
      let connectedLeadsQuery = getSupabaseAdmin()
        .from('leads')
        .select('id')
        .eq('owner_id', userData.id)
        .eq('is_deleted', false)
        .in('status', ['contacted', 'qualified', 'converted', 'lost'])

      // Handle special 'uncategorized' group
      if (id === 'uncategorized') {
        connectedLeadsQuery = connectedLeadsQuery.is('import_job_id', null)
      } else {
        connectedLeadsQuery = connectedLeadsQuery.eq('import_job_id', id)
      }

      const { data: connectedLeads } = await connectedLeadsQuery

      allowedLeadIds = connectedLeads?.map(l => l.id) || []

      if (allowedLeadIds.length === 0) {
        // No leads to show
        return NextResponse.json({
          leads: [],
          total: 0,
          page,
          totalPages: 0,
          perPage: LEADS_PER_PAGE,
        })
      }
    }

    // Build query
    let query = getSupabaseAdmin()
      .from('leads')
      .select(`
        id,
        first_name,
        last_name,
        phone,
        email,
        status,
        created_at,
        owner:users!leads_owner_id_fkey(id, first_name, last_name)
      `, { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    // Handle special 'uncategorized' group (leads without import_job_id)
    if (id === 'uncategorized') {
      query = query.is('import_job_id', null)
    } else {
      query = query.eq('import_job_id', id)
    }

    // For non-admins, filter to only their connected leads
    if (!isAdmin && allowedLeadIds) {
      query = query.in('id', allowedLeadIds)
    }

    // Apply search filter
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    // Pagination
    const offset = (page - 1) * LEADS_PER_PAGE
    const { data: leads, error: leadsError, count } = await query.range(offset, offset + LEADS_PER_PAGE - 1)

    if (leadsError) {
      console.error('[Import Leads] Error fetching leads:', leadsError)
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
    }

    return NextResponse.json({
      leads: leads || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / LEADS_PER_PAGE),
      perPage: LEADS_PER_PAGE,
    })
  } catch (error) {
    console.error('[Import Leads] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
