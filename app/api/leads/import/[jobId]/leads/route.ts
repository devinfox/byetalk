import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const LEADS_PER_PAGE = 10

/**
 * GET /api/leads/import/[jobId]/leads
 * Get paginated leads for a specific import job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user info
    const { data: userData } = await getSupabaseAdmin()
      .from('users')
      .select('id, role, organization_id')
      .or(`auth_user_id.eq.${user.id},auth_id.eq.${user.id}`)
      .single()

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only admins/managers can view leads by import job
    if (userData.role !== 'admin' && userData.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const search = searchParams.get('search') || ''

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
      .eq('import_job_id', jobId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

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
