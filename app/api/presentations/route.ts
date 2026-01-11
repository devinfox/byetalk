import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { PresentationInsert } from '@/types/presentation.types'

// GET /api/presentations - List all presentations
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const isTemplate = searchParams.get('is_template') === 'true'
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('presentations')
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (isTemplate) {
      query = query.eq('is_template', true)
    }

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    if (entityId) {
      query = query.eq('entity_id', entityId)
    }

    const { data: presentations, error, count } = await query

    if (error) {
      console.error('Error fetching presentations:', error)
      return NextResponse.json({ error: 'Failed to fetch presentations' }, { status: 500 })
    }

    return NextResponse.json({
      presentations,
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Presentations GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/presentations - Create new presentation
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

    // Get CRM user ID from users table
    const { data: crmUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()

    if (userError || !crmUser) {
      console.error('Error fetching CRM user:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      description,
      status = 'draft',
      canvas_width = 1920,
      canvas_height = 1080,
      background_color = '#FFFFFF',
      template_id,
      is_template = false,
      template_category,
      entity_type = 'global',
      entity_id,
      deal_id,
      lead_id,
      contact_id,
    } = body

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const presentationData: PresentationInsert = {
      name: name.trim(),
      description,
      status,
      canvas_width,
      canvas_height,
      background_color,
      template_id,
      is_template,
      template_category,
      owner_id: crmUser.id,
      entity_type,
      entity_id,
      deal_id,
      lead_id,
      contact_id,
    }

    // Create presentation
    const { data: presentation, error: insertError } = await supabase
      .from('presentations')
      .insert(presentationData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating presentation:', insertError)
      return NextResponse.json({ error: 'Failed to create presentation' }, { status: 500 })
    }

    // Create first slide
    const { error: slideError } = await supabase.from('presentation_slides').insert({
      presentation_id: presentation.id,
      slide_order: 0,
      name: 'Slide 1',
      background_color: background_color,
      canvas_json: { version: '6.0.0', objects: [] },
    })

    if (slideError) {
      console.error('Error creating initial slide:', slideError)
      // Don't fail the whole request, just log it
    }

    return NextResponse.json({ presentation }, { status: 201 })
  } catch (error) {
    console.error('Presentations POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
