import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


export async function POST(request: NextRequest) {
  try {
    const { callId, diarizedTranscript } = await request.json()

    if (!callId) {
      return NextResponse.json({ error: 'callId required' }, { status: 400 })
    }

    // Get current call
    const { data: call, error: fetchError } = await getSupabaseAdmin()
      .from('calls')
      .select('id, custom_fields')
      .eq('id', callId)
      .single()

    if (fetchError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    // Update custom_fields with new diarized transcript
    const updatedCustomFields = {
      ...((call.custom_fields as Record<string, unknown>) || {}),
      diarized_transcript: diarizedTranscript,
    }

    const { error: updateError } = await getSupabaseAdmin()
      .from('calls')
      .update({ custom_fields: updatedCustomFields })
      .eq('id', callId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// GET to find calls by searching transcription
export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search')

  const { data: calls } = await getSupabaseAdmin()
    .from('calls')
    .select('id, transcription, started_at, to_number')
    .eq('is_deleted', false)
    .not('transcription', 'is', null)
    .order('started_at', { ascending: true })

  if (search) {
    const filtered = calls?.filter(c =>
      c.transcription?.toLowerCase().includes(search.toLowerCase())
    )
    return NextResponse.json({ calls: filtered })
  }

  return NextResponse.json({ calls })
}
