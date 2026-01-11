import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/leads/import/[id]
 * Get import job status and details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await getSupabaseAdmin()
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get import job
    const { data: job, error: jobError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
    }

    // Check access
    if (
      job.created_by !== currentUser.id &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'manager'
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get errors for this job
    const { data: errors } = await getSupabaseAdmin()
      .from('lead_import_errors')
      .select('*')
      .eq('import_job_id', id)
      .order('row_number')
      .limit(50)

    return NextResponse.json({
      job,
      errors: errors || [],
    })
  } catch (error) {
    console.error('[Import] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch import job' },
      { status: 500 }
    )
  }
}
