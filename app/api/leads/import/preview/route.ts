import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/leads/import/preview
 * Parse CSV headers and return sample data for field mapping
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Check file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 })
    }

    // Read file content
    const content = await file.text()
    const lines = content.split(/\r?\n/).filter(line => line.trim())

    if (lines.length < 1) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
    }

    // Parse headers
    const headers = parseCSVLine(lines[0])

    // Get sample data (first 5 rows)
    const sampleData: Record<string, string>[] = []
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const values = parseCSVLine(lines[i])
      const row: Record<string, string> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx] || ''
      })
      sampleData.push(row)
    }

    // Auto-suggest field mappings based on header names
    const suggestedMappings: Record<string, string> = {}
    const fieldPatterns: Record<string, RegExp[]> = {
      first_name: [/^first[_\s]?name$/i, /^fname$/i, /^first$/i, /^given[_\s]?name$/i],
      last_name: [/^last[_\s]?name$/i, /^lname$/i, /^last$/i, /^surname$/i, /^family[_\s]?name$/i],
      email: [/^e?mail$/i, /^email[_\s]?address$/i],
      phone: [/^phone$/i, /^phone[_\s]?number$/i, /^mobile$/i, /^cell$/i, /^telephone$/i, /^primary[_\s]?phone$/i],
      phone_secondary: [/^phone[_\s]?2$/i, /^secondary[_\s]?phone$/i, /^alt[_\s]?phone$/i, /^work[_\s]?phone$/i, /^home[_\s]?phone$/i],
      address_line1: [/^address$/i, /^address[_\s]?1$/i, /^street$/i, /^address[_\s]?line[_\s]?1$/i],
      address_line2: [/^address[_\s]?2$/i, /^address[_\s]?line[_\s]?2$/i, /^apt$/i, /^suite$/i, /^unit$/i],
      city: [/^city$/i, /^town$/i],
      state: [/^state$/i, /^province$/i, /^region$/i],
      zip_code: [/^zip$/i, /^zip[_\s]?code$/i, /^postal$/i, /^postal[_\s]?code$/i],
      country: [/^country$/i],
      notes: [/^notes?$/i, /^comments?$/i, /^description$/i],
      source_type: [/^source$/i, /^lead[_\s]?source$/i, /^source[_\s]?type$/i],
      utm_source: [/^utm[_\s]?source$/i],
      utm_medium: [/^utm[_\s]?medium$/i],
      utm_campaign: [/^utm[_\s]?campaign$/i],
    }

    headers.forEach(header => {
      for (const [field, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(p => p.test(header))) {
          suggestedMappings[header] = field
          break
        }
      }
    })

    return NextResponse.json({
      headers,
      totalRows: lines.length - 1,
      sampleData,
      suggestedMappings,
      fileName: file.name,
      fileSize: file.size,
    })
  } catch (error) {
    console.error('[Import Preview] Error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to parse CSV' },
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
