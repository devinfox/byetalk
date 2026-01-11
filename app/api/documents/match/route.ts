import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import OpenAI from 'openai'

let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

interface MatchedDocument {
  id: string
  file_name: string
  public_url: string | null
  confidence: number
  match_reason: string
}

/**
 * POST /api/documents/match
 * Find documents that match given search hints using AI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, search_hints, context } = body

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    if (!search_hints || !Array.isArray(search_hints) || search_hints.length === 0) {
      return NextResponse.json({ error: 'search_hints array is required' }, { status: 400 })
    }

    // Fetch user's documents
    const { data: documents, error: fetchError } = await getSupabaseAdmin()
      .from('documents')
      .select('id, file_name, file_type, description, tags, public_url, mime_type')
      .eq('uploaded_by', user_id)
      .eq('is_deleted', false)
      .eq('entity_type', 'global')
      .order('created_at', { ascending: false })
      .limit(100)

    if (fetchError) {
      console.error('Error fetching documents:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ matched_documents: [] })
    }

    // Use AI to match documents to hints
    const openai = getOpenAI()
    if (!openai) {
      // Fallback: simple keyword matching
      const matchedDocs = simpleKeywordMatch(documents, search_hints)
      return NextResponse.json({ matched_documents: matchedDocs })
    }

    // Build document list for AI
    const documentList = documents.map((doc, index) => ({
      index,
      id: doc.id,
      file_name: doc.file_name,
      file_type: doc.file_type,
      description: doc.description,
      tags: doc.tags,
    }))

    const prompt = `You are helping match documents to what a sales rep promised to send during a call.

SEARCH HINTS (what was promised to send):
${search_hints.map((h: string, i: number) => `${i + 1}. "${h}"`).join('\n')}

${context ? `CALL CONTEXT:\n${context}\n` : ''}

AVAILABLE DOCUMENTS:
${documentList.map(d => `- [${d.index}] "${d.file_name}" (type: ${d.file_type || 'unknown'}${d.description ? `, desc: ${d.description}` : ''}${d.tags?.length ? `, tags: ${d.tags.join(', ')}` : ''})`).join('\n')}

Analyze which documents best match what was promised. Consider:
- Document filename relevance (e.g., "brochure" matches "Gold_IRA_Brochure.pdf")
- File type appropriateness (PDFs for brochures, spreadsheets for pricing)
- Description and tags if available

Return a JSON object with:
{
  "matches": [
    {
      "document_index": <number>,
      "confidence": <0.0 to 1.0>,
      "match_reason": "<brief explanation>"
    }
  ]
}

Only include documents with confidence >= 0.5. Order by confidence descending.
If no documents match well, return empty matches array.

Respond with ONLY valid JSON, no markdown.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a document matching assistant. Match documents to search criteria and return JSON results only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 1000,
    })

    const responseText = response.choices[0]?.message?.content?.trim()
    if (!responseText) {
      // Fallback to simple matching
      const matchedDocs = simpleKeywordMatch(documents, search_hints)
      return NextResponse.json({ matched_documents: matchedDocs })
    }

    // Parse response
    let jsonStr = responseText
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const result = JSON.parse(jsonStr)

    // Convert AI results to full document objects
    const matchedDocuments: MatchedDocument[] = (result.matches || [])
      .filter((m: any) => m.document_index >= 0 && m.document_index < documents.length)
      .map((m: any) => {
        const doc = documents[m.document_index]
        return {
          id: doc.id,
          file_name: doc.file_name,
          public_url: doc.public_url,
          confidence: m.confidence,
          match_reason: m.match_reason
        }
      })

    return NextResponse.json({ matched_documents: matchedDocuments })

  } catch (error) {
    console.error('Error in document matching:', error)
    return NextResponse.json(
      { error: 'Failed to match documents' },
      { status: 500 }
    )
  }
}

/**
 * Simple keyword-based document matching (fallback when AI unavailable)
 */
function simpleKeywordMatch(
  documents: any[],
  searchHints: string[]
): MatchedDocument[] {
  const results: MatchedDocument[] = []
  const hintsLower = searchHints.map(h => h.toLowerCase())

  for (const doc of documents) {
    const fileNameLower = doc.file_name.toLowerCase()
    const descLower = (doc.description || '').toLowerCase()
    const tagsLower = (doc.tags || []).map((t: string) => t.toLowerCase())

    let matchScore = 0
    const matchedHints: string[] = []

    for (const hint of hintsLower) {
      const hintWords = hint.split(/\s+/)

      for (const word of hintWords) {
        if (word.length < 3) continue

        if (fileNameLower.includes(word)) {
          matchScore += 0.4
          matchedHints.push(word)
        }
        if (descLower.includes(word)) {
          matchScore += 0.2
          matchedHints.push(word)
        }
        if (tagsLower.some((t: string) => t.includes(word))) {
          matchScore += 0.3
          matchedHints.push(word)
        }
      }
    }

    if (matchScore >= 0.3) {
      results.push({
        id: doc.id,
        file_name: doc.file_name,
        public_url: doc.public_url,
        confidence: Math.min(matchScore, 1.0),
        match_reason: `Keyword match: ${[...new Set(matchedHints)].join(', ')}`
      })
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
}
