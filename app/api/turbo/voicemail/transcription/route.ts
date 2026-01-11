import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/turbo/voicemail/transcription
 * Handle voicemail transcription callback from Twilio
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const callSid = searchParams.get('call_sid') || formData.get('CallSid') as string
    const transcriptionText = formData.get('TranscriptionText') as string
    const transcriptionStatus = formData.get('TranscriptionStatus') as string
    const recordingSid = formData.get('RecordingSid') as string

    console.log(`[Turbo Voicemail Transcription] Received for ${callSid}: Status=${transcriptionStatus}`)

    if (callSid && transcriptionText && transcriptionStatus === 'completed') {
      // Update the active turbo call with transcription
      const { error: updateError } = await getSupabaseAdmin()
        .from('turbo_active_calls')
        .update({
          voicemail_transcription: transcriptionText,
        })
        .eq('call_sid', callSid)

      if (updateError) {
        console.error(`[Turbo Voicemail Transcription] Error updating:`, updateError)
      } else {
        console.log(`[Turbo Voicemail Transcription] Saved transcription for call ${callSid}`)
      }

      // Also try to update the main calls table if there's a linked call
      const { data: activeCall } = await getSupabaseAdmin()
        .from('turbo_active_calls')
        .select('call_id')
        .eq('call_sid', callSid)
        .single()

      if (activeCall?.call_id) {
        await getSupabaseAdmin()
          .from('calls')
          .update({
            transcription: transcriptionText,
          })
          .eq('id', activeCall.call_id)
      }
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Turbo Voicemail Transcription] Error:', error)
    return new NextResponse('OK', { status: 200 }) // Always return 200 to Twilio
  }
}
