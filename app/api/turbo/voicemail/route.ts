import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VoiceResponse = twilio.twiml.VoiceResponse

/**
 * POST /api/turbo/voicemail
 * Handle voicemail recording completion for turbo calls
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const { searchParams } = new URL(request.url)

    const callSid = searchParams.get('call_sid') || formData.get('CallSid') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingSid = formData.get('RecordingSid') as string
    const recordingDuration = formData.get('RecordingDuration') as string

    console.log(`[Turbo Voicemail] Recording received for ${callSid}: ${recordingUrl}`)

    if (callSid && recordingUrl) {
      // Update the active turbo call with voicemail URL
      await getSupabaseAdmin()
        .from('turbo_active_calls')
        .update({
          voicemail_url: recordingUrl,
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('call_sid', callSid)

      // Also update the queue item
      const { data: activeCall } = await getSupabaseAdmin()
        .from('turbo_active_calls')
        .select('queue_item_id')
        .eq('call_sid', callSid)
        .single()

      if (activeCall?.queue_item_id) {
        await getSupabaseAdmin()
          .from('turbo_call_queue')
          .update({
            status: 'completed',
            last_disposition: 'voicemail',
          })
          .eq('id', activeCall.queue_item_id)
      }

      console.log(`[Turbo Voicemail] Saved voicemail for call ${callSid}`)
    }

    // Return TwiML to end the call gracefully
    const twiml = new VoiceResponse()
    twiml.say({ voice: 'alice' }, 'Thank you for your message. Goodbye.')
    twiml.hangup()

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('[Turbo Voicemail] Error:', error)
    const twiml = new VoiceResponse()
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
}
