import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * GET /api/leads/import/[jobId]
 * Get status of a specific import job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the import job
    const { data: job, error } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error || !job) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
    }

    return NextResponse.json(job)
  } catch (error) {
    console.error('[Import] Error fetching job:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch import job' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/leads/import/[jobId]
 * Cancel an import job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update job status to cancelled
    const { error } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['pending', 'processing']) // Only cancel jobs that aren't done

    if (error) {
      return NextResponse.json({ error: 'Failed to cancel import' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Import cancelled' })
  } catch (error) {
    console.error('[Import] Error cancelling job:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to cancel import' },
      { status: 500 }
    )
  }
}
