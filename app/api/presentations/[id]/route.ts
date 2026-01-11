import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { PresentationUpdate } from '@/types/presentation.types'

// Admin client for operations that need to bypass RLS
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/presentations/[id] - Get single presentation with slides
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get presentation
    const { data: presentation, error: presentationError } = await supabase
      .from('presentations')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (presentationError || !presentation) {
      return NextResponse.json({ error: 'Presentation not found' }, { status: 404 })
    }

    // Get slides
    const { data: slides, error: slidesError } = await supabase
      .from('presentation_slides')
      .select('*')
      .eq('presentation_id', id)
      .order('slide_order', { ascending: true })

    if (slidesError) {
      console.error('Error fetching slides:', slidesError)
    }

    // Update last_viewed_at
    await supabase
      .from('presentations')
      .update({ last_viewed_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({
      presentation,
      slides: slides || [],
    })
  } catch (error) {
    console.error('Presentation GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/presentations/[id] - Update presentation
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      status,
      canvas_width,
      canvas_height,
      background_color,
      thumbnail_url,
      is_template,
      template_category,
    } = body

    const updates: PresentationUpdate & { updated_at: string } = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description
    if (status !== undefined) updates.status = status
    if (canvas_width !== undefined) updates.canvas_width = canvas_width
    if (canvas_height !== undefined) updates.canvas_height = canvas_height
    if (background_color !== undefined) updates.background_color = background_color
    if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url
    if (is_template !== undefined) updates.is_template = is_template
    if (template_category !== undefined) updates.template_category = template_category

    const { data: presentation, error } = await supabase
      .from('presentations')
      .update(updates)
      .eq('id', id)
      .eq('is_deleted', false)
      .select()
      .single()

    if (error) {
      console.error('Error updating presentation:', error)
      return NextResponse.json({ error: 'Failed to update presentation' }, { status: 500 })
    }

    if (!presentation) {
      return NextResponse.json({ error: 'Presentation not found' }, { status: 404 })
    }

    return NextResponse.json({ presentation })
  } catch (error) {
    console.error('Presentation PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/presentations/[id] - Soft delete presentation
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get CRM user ID
    const { data: crmUser } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('auth_id', user.id)
      .single()

    if (!crmUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // First check if presentation exists and user has access
    const { data: presentation, error: fetchError } = await supabase
      .from('presentations')
      .select('id, owner_id, organization_id')
      .eq('id', id)
      .eq('is_deleted', false)
      .single()

    if (fetchError || !presentation) {
      console.error('Presentation not found:', fetchError)
      return NextResponse.json({ error: 'Presentation not found' }, { status: 404 })
    }

    // Check if user is owner or in same organization
    const canDelete = presentation.owner_id === crmUser.id ||
                      presentation.organization_id === crmUser.organization_id

    if (!canDelete) {
      return NextResponse.json({ error: 'Not authorized to delete this presentation' }, { status: 403 })
    }

    // Soft delete using admin client to bypass RLS
    const { data: updated, error } = await supabaseAdmin
      .from('presentations')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error deleting presentation:', error)
      return NextResponse.json({ error: 'Failed to delete presentation' }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: 'Failed to delete presentation' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Presentation DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
