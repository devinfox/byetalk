import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const callSid = formData.get('CallSid') as string
    const transcriptionText = formData.get('TranscriptionText') as string
    const transcriptionStatus = formData.get('TranscriptionStatus') as string
    const recordingSid = formData.get('RecordingSid') as string

    console.log('[Voicemail Transcription] Received:', {
      callSid,
      transcriptionStatus,
      transcriptionText: transcriptionText?.substring(0, 100),
      recordingSid,
    })

    // Update call record with transcription if successful
    if (callSid && transcriptionText && transcriptionStatus === 'completed') {
      const { error } = await getSupabaseAdmin()
        .from('calls')
        .update({
          transcription: transcriptionText,
          updated_at: new Date().toISOString(),
        })
        .eq('call_sid', callSid)

      if (error) {
        console.error('[Voicemail Transcription] Failed to update call:', error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Voicemail Transcription] Error:', error)
    return NextResponse.json({ error: 'Failed to process transcription' }, { status: 500 })
  }
}
