import { createClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/leads/tags - Get all unique tags from leads
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role to fetch all leads
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch all leads with AI tags
    const { data: leads, error: leadsError } = await serviceClient
      .from('leads')
      .select('ai_tags')
      .eq('is_deleted', false)
      .not('ai_tags', 'is', null)

    if (leadsError) {
      console.error('Error fetching leads:', leadsError)
      return NextResponse.json({ error: leadsError.message }, { status: 500 })
    }

    // Extract and count unique tags
    const tagCounts = new Map<string, { label: string; category: string; count: number }>()

    for (const lead of leads || []) {
      const tags = lead.ai_tags as Array<{ label: string; category: string }> | null
      if (!tags || !Array.isArray(tags)) continue

      for (const tag of tags) {
        const key = `${tag.category}:${tag.label}`
        const existing = tagCounts.get(key)
        if (existing) {
          existing.count++
        } else {
          tagCounts.set(key, {
            label: tag.label,
            category: tag.category,
            count: 1,
          })
        }
      }
    }

    // Sort by count descending, then by label
    const sortedTags = Array.from(tagCounts.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label)
    })

    return NextResponse.json({ data: sortedTags })
  } catch (error) {
    console.error('Error in GET /api/leads/tags:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
