import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * POST /api/turbo/conference/status
 * Handle Twilio conference status callbacks
 * Events: start, end, join, leave
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const formData = await request.formData()

    const conferenceSid = formData.get('ConferenceSid') as string
    const statusCallbackEvent = formData.get('StatusCallbackEvent') as string
    const friendlyName = formData.get('FriendlyName') as string
    const callSid = formData.get('CallSid') as string

    // Log all form data for debugging
    const allParams: Record<string, string> = {}
    formData.forEach((value, key) => {
      allParams[key] = value.toString()
    })
    console.log(`[Turbo Conference] CALLBACK RECEIVED - Event: ${statusCallbackEvent}, Conference: ${friendlyName}, Session: ${sessionId}`)
    console.log(`[Turbo Conference] Full params:`, JSON.stringify(allParams))

    if (!sessionId) {
      return new NextResponse('OK', { status: 200 })
    }

    switch (statusCallbackEvent) {
      case 'start':
      case 'conference-start':  // Support both formats for compatibility
        // Conference started - update session with conference SID
        await getSupabaseAdmin()
          .from('turbo_mode_sessions')
          .update({
            conference_sid: conferenceSid,
          })
          .eq('id', sessionId)
        console.log(`[Turbo Conference] Conference started: ${conferenceSid}`)
        break

      case 'end':
      case 'conference-end':  // Support both formats for compatibility
        // Conference ended - rep disconnected, end session
        await getSupabaseAdmin()
          .from('turbo_mode_sessions')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            conference_sid: null,
            current_call_sid: null,
          })
          .eq('id', sessionId)
        console.log(`[Turbo Conference] Conference ended, session ended: ${sessionId}`)
        break

      case 'join':
      case 'participant-join':  // Support both formats for compatibility
        console.log(`[Turbo Conference] Participant joined: ${callSid}`)
        break

      case 'leave':
      case 'participant-leave':  // Support both formats for compatibility
        // A participant left - check if it was the lead
        const { data: session } = await getSupabaseAdmin()
          .from('turbo_mode_sessions')
          .select('current_call_sid, id')
          .eq('id', sessionId)
          .single()

        if (session && session.current_call_sid === callSid) {
          // The lead left - release the rep back to the pool
          await getSupabaseAdmin().rpc('release_turbo_rep', {
            p_session_id: sessionId,
          })
          console.log(`[Turbo Conference] Lead left, rep released back to pool: ${sessionId}`)
        }
        break
    }

    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Turbo Conference] Error:', error)
    return new NextResponse('OK', { status: 200 })
  }
}

export async function GET() {
  return new NextResponse('Conference status webhook', { status: 200 })
}
