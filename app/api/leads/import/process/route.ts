import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Allow up to 5 minutes for processing (Vercel Pro limit)
export const maxDuration = 300

// Smaller batches = more reliable, less memory usage
const BATCH_SIZE = 200 // Process 200 rows at a time for reliability
const PROGRESS_UPDATE_INTERVAL = 500 // Update progress every 500 rows

/**
 * POST /api/leads/import/process
 * Background processor for large CSV imports
 * Processes in chunks and re-triggers itself for very large files
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobId, startRow = 0 } = body

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    // Get the import job
    const { data: importJob, error: jobError } = await getSupabaseAdmin()
      .from('lead_import_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !importJob) {
      console.error('[Import Process] Job not found:', jobError)
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
    }

    // Check if job was cancelled
    if (importJob.status === 'cancelled') {
      return NextResponse.json({ message: 'Job was cancelled' })
    }

    // Update status to processing if this is the first chunk
    if (startRow === 0) {
      await getSupabaseAdmin()
        .from('lead_import_jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', jobId)
    }

    // Download CSV from storage
    const { data: csvData, error: downloadError } = await getSupabaseAdmin()
      .storage
      .from('documents')
      .download(importJob.storage_path)

    if (downloadError || !csvData) {
      console.error('[Import Process] Failed to download CSV:', downloadError)
      await markJobFailed(jobId, 'Failed to download CSV file')
      return NextResponse.json({ error: 'Failed to download CSV' }, { status: 500 })
    }

    const content = await csvData.text()
    const lines = content.split(/\r?\n/).filter(line => line.trim())
    const headers = parseCSVLine(lines[0])

    const fieldMapping = importJob.field_mapping as Record<string, string>
    const duplicateCheckFields = (importJob.duplicate_check_fields as string[]) || ['phone', 'email']
    const skipDuplicates = importJob.skip_duplicates !== false

    // Initialize or continue counters
    let processedRows = importJob.processed_rows || 0
    let successfulRows = importJob.successful_rows || 0
    let failedRows = importJob.failed_rows || 0
    let duplicateRows = importJob.duplicate_rows || 0
    const errors: { row_number: number; row_data: Record<string, string>; error_message: string }[] = []

    // Process ALL remaining rows (no chunking - rely on 5 min timeout)
    const dataStartRow = startRow + 1 // +1 for header
    const endRow = importJob.total_rows // Process everything

    console.log(`[Import Process] Job ${jobId}: Processing rows ${startRow + 1} to ${endRow} of ${importJob.total_rows}`)

    // Process in batches within this chunk
    for (let i = dataStartRow; i <= endRow; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, endRow + 1)
      const batchLines = lines.slice(i, batchEnd)
      const leadsToCheck: { lead: Record<string, unknown>; rowNumber: number }[] = []

      // First pass: parse all rows and collect valid leads
      for (let j = 0; j < batchLines.length; j++) {
        const rowNumber = i + j
        const line = batchLines[j]

        if (!line.trim()) continue

        try {
          const values = parseCSVLine(line)
          const rowData: Record<string, string> = {}

          // Map CSV values to headers
          headers.forEach((header, idx) => {
            rowData[header] = values[idx] || ''
          })

          // Map to lead fields
          const lead: Record<string, unknown> = {
            status: importJob.default_status || 'new',
            owner_id: importJob.default_owner_id || null,
            campaign_id: importJob.default_campaign_id || null,
            import_job_id: jobId, // Track which import this lead came from
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
              } else if (leadField === 'is_dnc' || leadField === 'is_dupe' || leadField === 'is_accepted') {
                // Convert Yes/No/Y/N/True/False to boolean
                const lowerValue = value.toLowerCase()
                if (['yes', 'y', 'true', '1'].includes(lowerValue)) {
                  lead[leadField] = true
                } else if (['no', 'n', 'false', '0'].includes(lowerValue)) {
                  lead[leadField] = false
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
            if (errors.length < 100) {
              errors.push({
                row_number: rowNumber,
                row_data: rowData,
                error_message: 'Row must have at least a name or contact info',
              })
            }
            failedRows++
            processedRows++
            continue
          }

          leadsToCheck.push({ lead, rowNumber })
        } catch (err) {
          if (errors.length < 100) {
            errors.push({
              row_number: rowNumber,
              row_data: {},
              error_message: (err as Error).message || 'Failed to parse row',
            })
          }
          failedRows++
          processedRows++
        }
      }

      // Second pass: batch duplicate check (much faster than individual queries)
      let leadsToInsert: Record<string, unknown>[] = []

      if (skipDuplicates && duplicateCheckFields.length > 0 && leadsToCheck.length > 0) {
        // Collect all phones and emails from this batch for duplicate checking
        const phonesToCheck = leadsToCheck
          .map(l => l.lead.phone as string)
          .filter(Boolean)
        const emailsToCheck = leadsToCheck
          .map(l => l.lead.email as string)
          .filter(Boolean)

        // Single query to find all existing duplicates
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
        for (const { lead } of leadsToCheck) {
          const isDupeByPhone = duplicateCheckFields.includes('phone') && lead.phone && existingPhones.has(lead.phone as string)
          const isDupeByEmail = duplicateCheckFields.includes('email') && lead.email && existingEmails.has((lead.email as string).toLowerCase())

          if (isDupeByPhone || isDupeByEmail) {
            duplicateRows++
            processedRows++
          } else {
            leadsToInsert.push(lead)
            // Add to existing sets to catch duplicates within the same batch
            if (lead.phone) existingPhones.add(lead.phone as string)
            if (lead.email) existingEmails.add((lead.email as string).toLowerCase())
          }
        }
      } else {
        // No duplicate checking - insert all valid leads
        leadsToInsert = leadsToCheck.map(l => l.lead)
      }

      // Bulk insert this batch
      if (leadsToInsert.length > 0) {
        const { error: insertError } = await getSupabaseAdmin()
          .from('leads')
          .insert(leadsToInsert)

        if (insertError) {
          console.error('[Import Process] Batch insert error:', insertError)
          failedRows += leadsToInsert.length
        } else {
          successfulRows += leadsToInsert.length
        }
        processedRows += leadsToInsert.length
      }

      // Update progress periodically (not every batch to reduce DB load)
      if (processedRows % PROGRESS_UPDATE_INTERVAL === 0 || i + BATCH_SIZE >= endRow) {
        await getSupabaseAdmin()
          .from('lead_import_jobs')
          .update({
            processed_rows: processedRows,
            successful_rows: successfulRows,
            failed_rows: failedRows,
            duplicate_rows: duplicateRows,
          })
          .eq('id', jobId)

        console.log(`[Import Process] Job ${jobId}: Progress - ${processedRows}/${importJob.total_rows} rows`)
      }
    }

    // Save errors
    if (errors.length > 0) {
      await getSupabaseAdmin()
        .from('lead_import_errors')
        .insert(
          errors.map(e => ({
            import_job_id: jobId,
            ...e,
          }))
        )
    }

    // All done - mark job as completed
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

    // Clean up CSV from storage
    await getSupabaseAdmin()
      .storage
      .from('documents')
      .remove([importJob.storage_path])

    console.log(`[Import Process] Job ${jobId}: Completed - ${successfulRows} successful, ${failedRows} failed, ${duplicateRows} duplicates`)

    return NextResponse.json({
      success: true,
      message: 'Import completed',
      processedRows,
      successfulRows,
      failedRows,
      duplicateRows,
    })
  } catch (error) {
    console.error('[Import Process] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Processing failed' },
      { status: 500 }
    )
  }
}

async function markJobFailed(jobId: string, errorMessage: string) {
  await getSupabaseAdmin()
    .from('lead_import_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

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
