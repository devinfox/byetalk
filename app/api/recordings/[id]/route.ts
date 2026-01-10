import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: callId } = await params

    // Get the call record to find the recording URL
    const { data: call, error } = await supabase
      .from('calls')
      .select('recording_url')
      .eq('id', callId)
      .single()

    if (error || !call?.recording_url) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    // Twilio recording URLs need authentication
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN

    if (!accountSid || !authToken) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
    }

    // Fetch the recording from Twilio with Basic Auth
    const recordingResponse = await fetch(call.recording_url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
    })

    if (!recordingResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch recording' }, { status: 502 })
    }

    // Get the audio data
    const audioBuffer = await recordingResponse.arrayBuffer()

    // Return the audio with proper headers
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error proxying recording:', error)
    return NextResponse.json({ error: 'Failed to load recording' }, { status: 500 })
  }
}
