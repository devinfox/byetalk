import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { SlideInsert, SlideUpdate } from '@/types/presentation.types'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/presentations/[id]/slides - Get all slides
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

    const { data: slides, error } = await supabase
      .from('presentation_slides')
      .select('*')
      .eq('presentation_id', id)
      .order('slide_order', { ascending: true })

    if (error) {
      console.error('Error fetching slides:', error)
      return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 })
    }

    return NextResponse.json({ slides })
  } catch (error) {
    console.error('Slides GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/presentations/[id]/slides - Create new slide
export async function POST(request: NextRequest, context: RouteContext) {
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
      slide_order,
      name,
      background_color = '#FFFFFF',
      background_image_url,
      canvas_json = { version: '6.0.0', objects: [] },
      notes,
      transition_type = 'none',
      transition_duration = 500,
    } = body

    // Get next slide order if not provided
    let order = slide_order
    if (order === undefined) {
      const { data: lastSlide } = await supabase
        .from('presentation_slides')
        .select('slide_order')
        .eq('presentation_id', id)
        .order('slide_order', { ascending: false })
        .limit(1)
        .single()

      order = lastSlide ? lastSlide.slide_order + 1 : 0
    }

    const slideData: SlideInsert = {
      presentation_id: id,
      slide_order: order,
      name: name || `Slide ${order + 1}`,
      background_color,
      background_image_url,
      canvas_json,
      notes,
      transition_type,
      transition_duration,
    }

    const { data: slide, error } = await supabase
      .from('presentation_slides')
      .insert(slideData)
      .select()
      .single()

    if (error) {
      console.error('Error creating slide:', error)
      return NextResponse.json({ error: 'Failed to create slide' }, { status: 500 })
    }

    return NextResponse.json({ slide }, { status: 201 })
  } catch (error) {
    console.error('Slides POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/presentations/[id]/slides - Update slide or bulk update
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
    const { slide_id, slides: bulkSlides, ...updates } = body

    // Bulk update for reordering
    if (bulkSlides && Array.isArray(bulkSlides)) {
      const results = await Promise.all(
        bulkSlides.map(async (slide: { id: string; slide_order: number }) => {
          const { error } = await supabase
            .from('presentation_slides')
            .update({ slide_order: slide.slide_order, updated_at: new Date().toISOString() })
            .eq('id', slide.id)
            .eq('presentation_id', id)

          return { id: slide.id, error }
        })
      )

      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        console.error('Error reordering slides:', errors)
        return NextResponse.json({ error: 'Failed to reorder some slides' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Single slide update
    if (!slide_id) {
      return NextResponse.json({ error: 'slide_id is required' }, { status: 400 })
    }

    const slideUpdates: SlideUpdate & { updated_at: string } = {
      updated_at: new Date().toISOString(),
    }

    if (updates.slide_order !== undefined) slideUpdates.slide_order = updates.slide_order
    if (updates.name !== undefined) slideUpdates.name = updates.name
    if (updates.background_color !== undefined) slideUpdates.background_color = updates.background_color
    if (updates.background_image_url !== undefined) slideUpdates.background_image_url = updates.background_image_url
    if (updates.canvas_json !== undefined) slideUpdates.canvas_json = updates.canvas_json
    if (updates.thumbnail_url !== undefined) slideUpdates.thumbnail_url = updates.thumbnail_url
    if (updates.notes !== undefined) slideUpdates.notes = updates.notes
    if (updates.transition_type !== undefined) slideUpdates.transition_type = updates.transition_type
    if (updates.transition_duration !== undefined) slideUpdates.transition_duration = updates.transition_duration

    const { data: slide, error } = await supabase
      .from('presentation_slides')
      .update(slideUpdates)
      .eq('id', slide_id)
      .eq('presentation_id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating slide:', error)
      return NextResponse.json({ error: 'Failed to update slide' }, { status: 500 })
    }

    return NextResponse.json({ slide })
  } catch (error) {
    console.error('Slides PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/presentations/[id]/slides - Delete slide
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

    const { searchParams } = new URL(request.url)
    const slideId = searchParams.get('slide_id')

    if (!slideId) {
      return NextResponse.json({ error: 'slide_id is required' }, { status: 400 })
    }

    // Get the slide to find its order
    const { data: slideToDelete } = await supabase
      .from('presentation_slides')
      .select('slide_order')
      .eq('id', slideId)
      .eq('presentation_id', id)
      .single()

    if (!slideToDelete) {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
    }

    // Delete the slide
    const { error } = await supabase
      .from('presentation_slides')
      .delete()
      .eq('id', slideId)
      .eq('presentation_id', id)

    if (error) {
      console.error('Error deleting slide:', error)
      return NextResponse.json({ error: 'Failed to delete slide' }, { status: 500 })
    }

    // Reorder remaining slides
    const { data: remainingSlides } = await supabase
      .from('presentation_slides')
      .select('id, slide_order')
      .eq('presentation_id', id)
      .gt('slide_order', slideToDelete.slide_order)
      .order('slide_order', { ascending: true })

    if (remainingSlides && remainingSlides.length > 0) {
      await Promise.all(
        remainingSlides.map((slide: { id: string; slide_order: number }) =>
          supabase
            .from('presentation_slides')
            .update({ slide_order: slide.slide_order - 1 })
            .eq('id', slide.id)
        )
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Slides DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
