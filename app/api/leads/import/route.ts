import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Allow up to 5 minutes for large file uploads
export const maxDuration = 300

/**
 * POST /api/leads/import
 * Upload CSV and create import job - returns immediately, processes in background
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's profile
    const { data: currentUser } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fieldMappingStr = formData.get('fieldMapping') as string | null
    const defaultStatus = formData.get('defaultStatus') as string || 'new'
    const defaultOwnerId = formData.get('defaultOwnerId') as string || null
    const defaultCampaignId = formData.get('defaultCampaignId') as string || null
    const skipDuplicates = formData.get('skipDuplicates') !== 'false'
    const duplicateCheckFieldsStr = formData.get('duplicateCheckFields') as string || 'phone,email'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!fieldMappingStr) {
      return NextResponse.json({ error: 'No field mapping provided' }, { status: 400 })
    }

    let fieldMapping: Record<string, string>
    try {
      fieldMapping = JSON.parse(fieldMappingStr)
    } catch {
      return NextResponse.json({ error: 'Invalid field mapping' }, { status: 400 })
    }

    // Read CSV content
    const content = await file.text()
    const lines = content.split(/\r?\n/).filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file must have at least a header row and one data row' }, { status: 400 })
    }

    const totalRows = lines.length - 1 // Exclude header

    // Store CSV content in Supabase Storage for background processing
    const csvFileName = `imports/${currentUser.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await getSupabaseAdmin()
      .storage
      .from('documents')
      .upload(csvFileName, content, {
        contentType: 'text/csv',
        upsert: true
      })

    if (uploadError) {
      console.error('[Import] Error uploading CSV:', uploadError)
      return NextResponse.json({ error: 'Failed to upload CSV file' }, { status: 500 })
    }

    // Create import job with 'pending' status
    const { data: importJob, error: createError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .insert({
        file_name: file.name,
        file_size: file.size,
        total_rows: totalRows,
        field_mapping: fieldMapping,
        default_status: defaultStatus,
        default_owner_id: defaultOwnerId || null,
        default_campaign_id: defaultCampaignId || null,
        skip_duplicates: skipDuplicates,
        duplicate_check_fields: duplicateCheckFieldsStr.split(',').map(f => f.trim()),
        created_by: currentUser.id,
        organization_id: currentUser.organization_id,
        status: 'pending',
        // Store the storage path for background processing
        storage_path: csvFileName,
      })
      .select()
      .single()

    if (createError || !importJob) {
      console.error('[Import] Error creating job:', createError)
      return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
    }

    // Trigger background processing (fire and forget)
    const baseUrl = request.nextUrl.origin
    fetch(`${baseUrl}/api/leads/import/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: importJob.id }),
    }).catch(err => {
      console.error('[Import] Failed to trigger background processing:', err)
    })

    // Return immediately - processing happens in background
    return NextResponse.json({
      success: true,
      importJobId: importJob.id,
      totalRows,
      message: 'Import started. You can close this page - we\'ll process your leads in the background.',
      status: 'pending',
    })
  } catch (error) {
    console.error('[Import] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Import failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/leads/import
 * List import jobs
 */
export async function GET(request: NextRequest) {
  try {
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

    let query = getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    // Non-admins can only see their own imports
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
      query = query.eq('created_by', currentUser.id)
    }

    const { data: jobs, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ jobs: jobs || [] })
  } catch (error) {
    console.error('[Import] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to fetch imports' },
      { status: 500 }
    )
  }
}
