import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

// GET /api/presentations/unsplash - Search Unsplash photos
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!UNSPLASH_ACCESS_KEY) {
      return NextResponse.json(
        { error: 'Unsplash API not configured' },
        { status: 503 }
      )
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')
    const page = searchParams.get('page') || '1'
    const perPage = searchParams.get('per_page') || '20'
    const orientation = searchParams.get('orientation') // landscape, portrait, squarish

    let endpoint = 'https://api.unsplash.com/photos'
    const params = new URLSearchParams({
      page,
      per_page: perPage,
    })

    if (query) {
      endpoint = 'https://api.unsplash.com/search/photos'
      params.set('query', query)
      if (orientation) {
        params.set('orientation', orientation)
      }
    }

    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        'Accept-Version': 'v1',
      },
    })

    if (!response.ok) {
      console.error('Unsplash API error:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Failed to fetch from Unsplash' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // For search results, return the results array
    // For regular photos, return as-is
    if (query) {
      return NextResponse.json(data)
    }

    return NextResponse.json({ results: data, total: data.length, total_pages: 1 })
  } catch (error) {
    console.error('Unsplash GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/presentations/unsplash - Track download (required by Unsplash API guidelines)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!UNSPLASH_ACCESS_KEY) {
      return NextResponse.json(
        { error: 'Unsplash API not configured' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { download_location } = body

    if (!download_location) {
      return NextResponse.json({ error: 'download_location is required' }, { status: 400 })
    }

    // Track the download with Unsplash
    const response = await fetch(download_location, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    })

    if (!response.ok) {
      console.error('Unsplash download track error:', response.status)
      // Don't fail - just log it
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unsplash POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
