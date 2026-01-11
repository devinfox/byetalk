import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Shared domain that all users can create accounts on
const SHARED_DOMAIN = 'bookaestheticala.com'

// GET /api/email/shared-domain - Get the shared domain info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the shared domain
    const { data: domain, error } = await getSupabaseAdmin()
      .from('email_domains')
      .select('id, domain, verification_status')
      .eq('domain', SHARED_DOMAIN)
      .eq('is_deleted', false)
      .single()

    if (error || !domain) {
      return NextResponse.json({ error: 'Shared domain not configured' }, { status: 404 })
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Shared domain GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
