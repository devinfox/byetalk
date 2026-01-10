import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/deals/[id]/close - Close a deal (won or lost)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()
    const { outcome } = body // 'won' or 'lost'

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!outcome || !['won', 'lost'].includes(outcome)) {
      return NextResponse.json({ error: 'Invalid outcome. Must be "won" or "lost"' }, { status: 400 })
    }

    // Use service role client to bypass RLS
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Update the deal
    const { data, error } = await serviceClient
      .from('deals')
      .update({
        stage: outcome === 'won' ? 'closed_won' : 'closed_lost',
        stage_entered_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error closing deal:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: data[0] })
  } catch (error) {
    console.error('Error in POST /api/deals/[id]/close:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
