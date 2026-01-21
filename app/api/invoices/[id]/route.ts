import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Check if user has invoice access (Jonathan Carrington or admin@citadelgold.com)
async function hasInvoiceAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<{ hasAccess: boolean; isAdmin: boolean; crmUserId: string | null }> {
  const { data: crmUser, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('auth_id', userId)
    .single()

  if (error || !crmUser) {
    return { hasAccess: false, isAdmin: false, crmUserId: null }
  }

  const email = crmUser.email?.toLowerCase()
  const isAdmin = email === 'admin@citadelgold.com'
  const isJonathan = email === 'jonathancarrington@citadelgold.com'

  return {
    hasAccess: isAdmin || isJonathan,
    isAdmin,
    crmUserId: crmUser.id
  }
}

// GET /api/invoices/[id] - Get single invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    let query = supabase
      .from('invoices')
      .select('*, creator:users!created_by(first_name, last_name, email)')
      .eq('id', id)
      .single()

    const { data: invoice, error } = await query

    if (error) {
      console.error('Error fetching invoice:', error)
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Check access - admin can see all, others only their own
    if (!isAdmin && invoice.created_by !== crmUserId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error('Invoice GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/invoices/[id] - Update invoice
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Check if user owns this invoice (only owner can update)
    const { data: existingInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('created_by')
      .eq('id', id)
      .single()

    if (fetchError || !existingInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (existingInvoice.created_by !== crmUserId) {
      return NextResponse.json({ error: 'Only the owner can update this invoice' }, { status: 403 })
    }

    const body = await request.json()
    const {
      name,
      invoice_number,
      client_name,
      client_address,
      client_city_state_zip,
      client_phone,
      date,
      line_items,
      grand_total,
      status,
    } = body

    const { data: invoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        name,
        invoice_number,
        client_name,
        client_address,
        client_city_state_zip,
        client_phone,
        date,
        line_items,
        grand_total,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating invoice:', updateError)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error('Invoice PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/invoices/[id] - Delete invoice
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    // Check if user owns this invoice (only owner can delete)
    const { data: existingInvoice, error: fetchError } = await supabase
      .from('invoices')
      .select('created_by')
      .eq('id', id)
      .single()

    if (fetchError || !existingInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (existingInvoice.created_by !== crmUserId) {
      return NextResponse.json({ error: 'Only the owner can delete this invoice' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting invoice:', deleteError)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Invoice DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
