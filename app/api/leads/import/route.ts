import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Allow up to 5 minutes for processing
export const maxDuration = 300

const BATCH_SIZE = 200 // Insert 200 rows at a time for reliability
const LARGE_FILE_THRESHOLD = 5000 // Use background processor for files with more than 5k rows

/**
 * Parse a CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Process import job in background
 */
async function processImportJob(
  jobId: string,
  lines: string[],
  headers: string[],
  fieldMapping: Record<string, string>,
  defaultStatus: string,
  defaultOwnerId: string | null,
  defaultCampaignId: string | null,
  skipDuplicates: boolean,
  duplicateCheckFields: string[]
) {
  const totalRows = lines.length - 1
  let processedRows = 0
  let successfulRows = 0
  let failedRows = 0
  let duplicateRows = 0

  console.log(`[Import] Starting background job ${jobId}: ${totalRows} rows`)

  try {
    // Process in batches
    for (let i = 1; i <= totalRows; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, totalRows + 1)
      const batchLines = lines.slice(i, batchEnd)
      const leadsToInsert: Record<string, unknown>[] = []

      // First pass: parse all rows in this batch
      const parsedLeads: Record<string, unknown>[] = []

      for (const line of batchLines) {
        if (!line.trim()) {
          processedRows++
          continue
        }

        try {
          const values = parseCSVLine(line)
          const rowData: Record<string, string> = {}

          // Map CSV values to headers
          headers.forEach((header, idx) => {
            rowData[header] = values[idx] || ''
          })

          // Map to lead fields
          const lead: Record<string, unknown> = {
            status: defaultStatus || 'new',
            owner_id: defaultOwnerId || null,
            campaign_id: defaultCampaignId || null,
            import_job_id: jobId,
          }

          Object.entries(fieldMapping).forEach(([csvCol, leadField]) => {
            if (leadField && rowData[csvCol] !== undefined) {
              let value = rowData[csvCol].trim()

              // Clean phone numbers
              if (leadField === 'phone' || leadField === 'phone_secondary') {
                value = value.replace(/\D/g, '').slice(-10)
                if (value.length === 10) {
                  lead[leadField] = value
                }
              } else if (value) {
                lead[leadField] = value
              }
            }
          })

          // Check for required data
          const hasName = lead.first_name || lead.last_name
          const hasContact = lead.phone || lead.email

          if (!hasName && !hasContact) {
            failedRows++
            processedRows++
            continue
          }

          parsedLeads.push(lead)
        } catch (err) {
          console.error('[Import] Row parse error:', err)
          failedRows++
          processedRows++
        }
      }

      // Second pass: batch duplicate checking (much faster than per-row)
      if (skipDuplicates && duplicateCheckFields.length > 0 && parsedLeads.length > 0) {
        const phonesToCheck = parsedLeads.map(l => l.phone as string).filter(Boolean)
        const emailsToCheck = parsedLeads.map(l => l.email as string).filter(Boolean)

        let existingPhones: Set<string> = new Set()
        let existingEmails: Set<string> = new Set()

        if (duplicateCheckFields.includes('phone') && phonesToCheck.length > 0) {
          const { data: existingByPhone } = await getSupabaseAdmin()
            .from('leads')
            .select('phone')
            .in('phone', phonesToCheck)
            .eq('is_deleted', false)
          existingPhones = new Set((existingByPhone || []).map(l => l.phone))
        }

        if (duplicateCheckFields.includes('email') && emailsToCheck.length > 0) {
          const { data: existingByEmail } = await getSupabaseAdmin()
            .from('leads')
            .select('email')
            .in('email', emailsToCheck)
            .eq('is_deleted', false)
          existingEmails = new Set((existingByEmail || []).map(l => l.email?.toLowerCase()))
        }

        // Filter out duplicates
        for (const lead of parsedLeads) {
          const isDupeByPhone = duplicateCheckFields.includes('phone') && lead.phone && existingPhones.has(lead.phone as string)
          const isDupeByEmail = duplicateCheckFields.includes('email') && lead.email && existingEmails.has((lead.email as string).toLowerCase())

          if (isDupeByPhone || isDupeByEmail) {
            duplicateRows++
            processedRows++
          } else {
            leadsToInsert.push(lead)
            // Track within-batch duplicates
            if (lead.phone) existingPhones.add(lead.phone as string)
            if (lead.email) existingEmails.add((lead.email as string).toLowerCase())
          }
        }
      } else {
        // No duplicate checking
        leadsToInsert.push(...parsedLeads)
      }

      // Bulk insert this batch
      if (leadsToInsert.length > 0) {
        const { error: insertError } = await getSupabaseAdmin()
          .from('leads')
          .insert(leadsToInsert)

        if (insertError) {
          console.error('[Import] Batch insert error:', insertError)
          failedRows += leadsToInsert.length
        } else {
          successfulRows += leadsToInsert.length
        }
        processedRows += leadsToInsert.length
      }

      // Update progress every batch
      await getSupabaseAdmin()
        .from('lead_import_jobs')
        .update({
          processed_rows: processedRows,
          successful_rows: successfulRows,
          failed_rows: failedRows,
          duplicate_rows: duplicateRows,
        })
        .eq('id', jobId)
    }

    // Mark job as completed
    const finalStatus = failedRows > 0 && successfulRows === 0 ? 'failed' : 'completed'
    await getSupabaseAdmin()
      .from('lead_import_jobs')
      .update({
        status: finalStatus,
        processed_rows: processedRows,
        successful_rows: successfulRows,
        failed_rows: failedRows,
        duplicate_rows: duplicateRows,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    console.log(`[Import] Job ${jobId}: Completed - ${successfulRows} successful, ${failedRows} failed, ${duplicateRows} duplicates`)
  } catch (error) {
    console.error('[Import] Background processing error:', error)
    await getSupabaseAdmin()
      .from('lead_import_jobs')
      .update({
        status: 'failed',
        error_message: (error as Error).message || 'Processing failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  }
}

/**
 * POST /api/leads/import
 * Upload CSV and start background import
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
      console.log('[Import] User not found for auth id:', user.id)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fieldMappingStr = formData.get('fieldMapping') as string | null
    const listName = formData.get('listName') as string || ''
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
    const headers = parseCSVLine(lines[0])
    const duplicateCheckFields = duplicateCheckFieldsStr.split(',').map(f => f.trim())

    // For very large files, use storage-based background processing
    // This allows processing to continue even if the initial request times out
    const useLargeFileProcessing = totalRows > LARGE_FILE_THRESHOLD

    // Create import job
    const { data: importJob, error: createError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .insert({
        file_name: file.name,
        display_name: listName || file.name.replace(/\.csv$/i, ''), // Use custom name or file name
        file_size: file.size,
        total_rows: totalRows,
        field_mapping: fieldMapping,
        default_status: defaultStatus,
        default_owner_id: defaultOwnerId || null,
        default_campaign_id: defaultCampaignId || null,
        skip_duplicates: skipDuplicates,
        duplicate_check_fields: duplicateCheckFields,
        created_by: currentUser.id,
        organization_id: currentUser.organization_id,
        status: useLargeFileProcessing ? 'pending' : 'processing',
        started_at: useLargeFileProcessing ? null : new Date().toISOString(),
      })
      .select()
      .single()

    if (createError || !importJob) {
      console.error('[Import] Error creating job:', createError)
      return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
    }

    if (useLargeFileProcessing) {
      // Upload CSV to storage for background processing
      const storagePath = `imports/${importJob.id}/${file.name}`
      const { error: uploadError } = await getSupabaseAdmin()
        .storage
        .from('documents')
        .upload(storagePath, new Blob([content], { type: 'text/csv' }), {
          contentType: 'text/csv',
          upsert: true,
        })

      if (uploadError) {
        console.error('[Import] Failed to upload CSV:', uploadError)
        await getSupabaseAdmin()
          .from('lead_import_jobs')
          .update({ status: 'failed', error_message: 'Failed to upload CSV file' })
          .eq('id', importJob.id)
        return NextResponse.json({ error: 'Failed to upload CSV' }, { status: 500 })
      }

      // Update job with storage path
      await getSupabaseAdmin()
        .from('lead_import_jobs')
        .update({ storage_path: storagePath })
        .eq('id', importJob.id)

      // Trigger background processor
      const baseUrl = request.nextUrl.origin
      fetch(`${baseUrl}/api/leads/import/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: importJob.id, startRow: 0 }),
      }).catch(err => {
        console.error('[Import] Failed to trigger processor:', err)
      })

      return NextResponse.json({
        success: true,
        importJobId: importJob.id,
        totalRows,
        status: 'pending',
        message: `Large import started! Processing ${totalRows.toLocaleString()} rows in the background.`,
      })
    }

    // For smaller files, process in background using after()
    after(async () => {
      await processImportJob(
        importJob.id,
        lines,
        headers,
        fieldMapping,
        defaultStatus,
        defaultOwnerId,
        defaultCampaignId,
        skipDuplicates,
        duplicateCheckFields
      )
    })

    // Return immediately
    return NextResponse.json({
      success: true,
      importJobId: importJob.id,
      totalRows,
      status: 'processing',
      message: 'Import started! We\'re updating your leads list in the background.',
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

    // Get current user
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
