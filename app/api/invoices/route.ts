import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Check if user has invoice access (John Carrington or admin@citadelgold.com)
async function hasInvoiceAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<{ hasAccess: boolean; isAdmin: boolean; crmUserId: string | null }> {
  const { data: crmUser, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('auth_id', userId)
    .single()

  if (error || !crmUser) {
    return { hasAccess: false, isAdmin: false, crmUserId: null }
  }

  const isAdmin = crmUser.email?.toLowerCase() === 'admin@citadelgold.com'
  const fullName = `${crmUser.first_name || ''} ${crmUser.last_name || ''}`.toLowerCase().trim()
  const isJohn = fullName === 'john carrington'

  return {
    hasAccess: isAdmin || isJohn,
    isAdmin,
    crmUserId: crmUser.id
  }
}

// GET /api/invoices - List invoices
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { hasAccess, isAdmin, crmUserId } = await hasInvoiceAccess(supabase, user.id)

    if (!hasAccess || !crmUserId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('invoices')
      .select('*, creator:users!created_by(first_name, last_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Admin sees all, John only sees his own
    if (!isAdmin) {
      query = query.eq('created_by', crmUserId)
    }

    const { data: invoices, error, count } = await query

    if (error) {
      console.error('Error fetching invoices:', error)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    return NextResponse.json({
      invoices,
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Invoices GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/invoices - Create new invoice
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { hasAccess, crmUserId } = await hasInvoiceAccess(supabase, user.id)

    if (!hasAccess || !crmUserId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const {
      invoice_number,
      client_name,
      client_address,
      client_city_state_zip,
      client_phone,
      date,
      line_items,
      grand_total,
      status = 'draft',
    } = body

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        created_by: crmUserId,
        invoice_number,
        client_name,
        client_address,
        client_city_state_zip,
        client_phone,
        date,
        line_items: line_items || [],
        grand_total: grand_total || 0,
        status,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating invoice:', insertError)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    return NextResponse.json({ invoice }, { status: 201 })
  } catch (error) {
    console.error('Invoices POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
