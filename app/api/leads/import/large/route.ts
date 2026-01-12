import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/leads/import/large
 * Handle large file imports where the file is already uploaded to storage
 */
export async function POST(request: NextRequest) {
  console.log('[Import Large] POST request received')

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
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

    const body = await request.json()
    const {
      storagePath,
      fileName,
      fileSize,
      totalRows,
      headers,
      fieldMapping,
      listName,
      defaultStatus,
      defaultOwnerId,
      defaultCampaignId,
      skipDuplicates,
      duplicateCheckFields,
    } = body

    console.log('[Import Large] Storage path:', storagePath)
    console.log('[Import Large] Total rows:', totalRows)

    if (!storagePath) {
      return NextResponse.json({ error: 'Storage path required' }, { status: 400 })
    }

    if (!fieldMapping) {
      return NextResponse.json({ error: 'Field mapping required' }, { status: 400 })
    }

    // Create import job
    const { data: importJob, error: createError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .insert({
        file_name: fileName,
        display_name: listName || fileName?.replace(/\.csv$/i, ''),
        file_size: fileSize,
        total_rows: totalRows,
        field_mapping: fieldMapping,
        default_status: defaultStatus || 'new',
        default_owner_id: defaultOwnerId || null,
        default_campaign_id: defaultCampaignId || null,
        skip_duplicates: skipDuplicates !== false,
        duplicate_check_fields: duplicateCheckFields || ['phone', 'email'],
        created_by: currentUser.id,
        organization_id: currentUser.organization_id,
        status: 'pending',
        storage_path: storagePath,
      })
      .select()
      .single()

    if (createError || !importJob) {
      console.error('[Import Large] Error creating job:', createError)
      return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
    }

    console.log('[Import Large] Created job:', importJob.id)

    // Trigger background processor
    const baseUrl = request.nextUrl.origin
    fetch(`${baseUrl}/api/leads/import/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: importJob.id, startRow: 0 }),
    }).catch(err => {
      console.error('[Import Large] Failed to trigger processor:', err)
    })

    return NextResponse.json({
      success: true,
      importJobId: importJob.id,
      totalRows,
      status: 'pending',
      message: `Large import started! Processing ${totalRows.toLocaleString()} rows in the background.`,
    })
  } catch (error) {
    console.error('[Import Large] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Import failed' },
      { status: 500 }
    )
  }
}
