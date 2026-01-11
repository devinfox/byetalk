import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const BATCH_SIZE = 500 // Process 500 rows at a time

/**
 * POST /api/leads/import
 * Upload CSV and create import job
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

    // Read and parse CSV content
    const content = await file.text()
    const lines = content.split(/\r?\n/).filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file must have at least a header row and one data row' }, { status: 400 })
    }

    const totalRows = lines.length - 1 // Exclude header

    // Create import job
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
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (createError || !importJob) {
      console.error('[Import] Error creating job:', createError)
      return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
    }

    // Parse CSV and process in batches
    const headers = parseCSVLine(lines[0])
    const duplicateCheckFields = duplicateCheckFieldsStr.split(',').map(f => f.trim())

    let processedRows = 0
    let successfulRows = 0
    let failedRows = 0
    let duplicateRows = 0
    const errors: { row_number: number; row_data: Record<string, string>; error_message: string }[] = []

    // Process in batches
    for (let i = 1; i < lines.length; i += BATCH_SIZE) {
      const batchLines = lines.slice(i, Math.min(i + BATCH_SIZE, lines.length))
      const leadsToInsert: Record<string, unknown>[] = []

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
            status: defaultStatus,
            owner_id: defaultOwnerId || null,
            campaign_id: defaultCampaignId || null,
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

          // Check for required data (at least name or phone or email)
          const hasName = lead.first_name || lead.last_name
          const hasContact = lead.phone || lead.email

          if (!hasName && !hasContact) {
            errors.push({
              row_number: rowNumber,
              row_data: rowData,
              error_message: 'Row must have at least a name or contact info (phone/email)',
            })
            failedRows++
            processedRows++
            continue
          }

          // Check for duplicates
          if (skipDuplicates && duplicateCheckFields.length > 0) {
            const duplicateConditions: string[] = []

            for (const field of duplicateCheckFields) {
              if (lead[field]) {
                duplicateConditions.push(`${field}.eq.${lead[field]}`)
              }
            }

            if (duplicateConditions.length > 0) {
              const { data: existing } = await getSupabaseAdmin()
                .from('leads')
                .select('id')
                .or(duplicateConditions.join(','))
                .eq('is_deleted', false)
                .limit(1)

              if (existing && existing.length > 0) {
                duplicateRows++
                processedRows++
                continue
              }
            }
          }

          leadsToInsert.push(lead)
        } catch (err) {
          errors.push({
            row_number: rowNumber,
            row_data: {},
            error_message: (err as Error).message || 'Failed to parse row',
          })
          failedRows++
          processedRows++
        }
      }

      // Bulk insert this batch
      if (leadsToInsert.length > 0) {
        const { error: insertError } = await getSupabaseAdmin()
          .from('leads')
          .insert(leadsToInsert)

        if (insertError) {
          console.error('[Import] Batch insert error:', insertError)
          // Mark all rows in this batch as failed
          failedRows += leadsToInsert.length
        } else {
          successfulRows += leadsToInsert.length
        }
        processedRows += leadsToInsert.length
      }

      // Update progress
      await getSupabaseAdmin()
        .from('lead_import_jobs')
        .update({
          processed_rows: processedRows,
          successful_rows: successfulRows,
          failed_rows: failedRows,
          duplicate_rows: duplicateRows,
        })
        .eq('id', importJob.id)
    }

    // Save errors (limit to first 100)
    if (errors.length > 0) {
      await getSupabaseAdmin()
        .from('lead_import_errors')
        .insert(
          errors.slice(0, 100).map(e => ({
            import_job_id: importJob.id,
            ...e,
          }))
        )
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
      .eq('id', importJob.id)

    return NextResponse.json({
      success: true,
      importJobId: importJob.id,
      totalRows,
      successfulRows,
      failedRows,
      duplicateRows,
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
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote state
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
