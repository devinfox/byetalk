import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // If no CRON_SECRET is set, allow in development
  if (!cronSecret && process.env.NODE_ENV === 'development') {
    return true
  }

  // Check Bearer token
  if (authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  // Check Vercel cron header
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  if (vercelCronHeader && cronSecret && vercelCronHeader === cronSecret) {
    return true
  }

  return false
}

// Process a single call
async function processCall(callId: string, baseUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/calls/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    })

    const result = await response.json()

    if (response.ok) {
      return { success: true }
    } else {
      return { success: false, error: result.error || 'Unknown error' }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to process' }
  }
}

export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    console.log('Cron: Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  console.log('Cron: Starting call processing job')

  try {
    // Find all unprocessed calls with recordings (created in last 24 hours)
    // This catches:
    // 1. Calls where AI processing never ran (ai_analysis_status is null)
    // 2. Calls where AI processing was marked pending but never completed
    // 3. Calls where AI processing failed
    // 4. Calls where tasks weren't generated for some reason
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: unprocessedCalls, error: fetchError } = await getSupabaseAdmin()
      .from('calls')
      .select('id, direction, duration_seconds, recording_url, created_at, ai_analysis_status')
      .eq('is_deleted', false)
      .not('recording_url', 'is', null)
      .gte('created_at', oneDayAgo)
      // Find calls that need processing: either ai_tasks_generated is false OR ai_analysis_status is not 'completed'
      .or('ai_tasks_generated.eq.false,ai_analysis_status.is.null,ai_analysis_status.eq.pending,ai_analysis_status.eq.failed')
      .order('created_at', { ascending: true })
      .limit(10) // Process max 10 per run to avoid timeout

    if (fetchError) {
      console.error('Cron: Error fetching calls:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
    }

    const callCount = unprocessedCalls?.length || 0
    console.log(`Cron: Found ${callCount} unprocessed calls`)

    if (callCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unprocessed calls found',
        processed: 0,
        failed: 0,
        duration_ms: Date.now() - startTime,
      })
    }

    // Get base URL
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

    // Process each call
    let processed = 0
    let failed = 0
    const results: Array<{ callId: string; success: boolean; error?: string }> = []

    for (const call of unprocessedCalls) {
      console.log(`Cron: Processing call ${call.id} (${call.direction}, ${call.duration_seconds}s, status: ${call.ai_analysis_status || 'null'})`)

      const result = await processCall(call.id, baseUrl)
      results.push({ callId: call.id, ...result })

      if (result.success) {
        processed++
        console.log(`Cron: ✅ Call ${call.id} processed successfully`)
      } else {
        failed++
        console.log(`Cron: ❌ Call ${call.id} failed: ${result.error}`)
      }

      // Small delay between calls to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const duration = Date.now() - startTime
    console.log(`Cron: Job completed in ${duration}ms - Processed: ${processed}, Failed: ${failed}`)

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} calls, ${failed} failed`,
      processed,
      failed,
      results,
      duration_ms: duration,
    })
  } catch (error) {
    console.error('Cron: Job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Job failed' },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
