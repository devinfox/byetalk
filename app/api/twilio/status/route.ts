import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role for webhook (no user session)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Trigger AI processing for a call
// Note: This is called synchronously to ensure it completes before serverless function terminates
async function triggerAIProcessing(callId: string, baseUrl: string): Promise<void> {
  try {
    console.log(`Triggering AI processing for call ${callId}`)
    const response = await fetch(`${baseUrl}/api/calls/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    })
    const result = await response.json()
    console.log(`AI processing result for ${callId}:`, result)
  } catch (error) {
    console.error('Failed to trigger AI processing:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    // Extract all possible parameters from both call status and recording callbacks
    const callSid = formData.get('CallSid') as string
    const parentCallSid = formData.get('ParentCallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const duration = formData.get('CallDuration') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingSid = formData.get('RecordingSid') as string
    const recordingStatus = formData.get('RecordingStatus') as string
    const toNumber = formData.get('To') as string
    const fromNumber = formData.get('From') as string
    const called = formData.get('Called') as string

    // Use Called as fallback for To
    const effectiveToNumber = toNumber || called || ''

    console.log('Twilio callback:', {
      callSid,
      parentCallSid,
      callStatus,
      recordingStatus,
      toNumber: effectiveToNumber,
      fromNumber,
      recordingUrl: recordingUrl ? 'present' : 'none',
      recordingSid
    })

    // Map Twilio status to our disposition
    const dispositionMap: Record<string, string> = {
      completed: 'answered',
      busy: 'busy',
      'no-answer': 'no_answer',
      failed: 'no_answer',
      canceled: 'no_answer',
    }

    // Helper function to normalize phone numbers to last 10 digits
    const normalizePhone = (phone: string | null): string => {
      if (!phone) return ''
      return phone.replace(/\D/g, '').slice(-10)
    }

    // Find the call record
    let existingCall: { id: string } | null = null
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    // Normalize phone numbers for matching
    const cleanToNumber = normalizePhone(effectiveToNumber)
    const cleanFromNumber = normalizePhone(fromNumber)

    console.log('Normalized phone numbers:', { cleanToNumber, cleanFromNumber })

    // Method 1: Try to find by call_sid (primary method when client stores it)
    if (callSid) {
      const { data: callBySid } = await supabase
        .from('calls')
        .select('id')
        .eq('call_sid', callSid)
        .single()

      if (callBySid) {
        existingCall = callBySid
        console.log('Found call by call_sid:', callSid)
      }
    }

    // Method 2: Try parent call sid (for child leg callbacks)
    if (!existingCall && parentCallSid) {
      const { data: callByParent } = await supabase
        .from('calls')
        .select('id')
        .eq('call_sid', parentCallSid)
        .single()

      if (callByParent) {
        existingCall = callByParent
        console.log('Found call by parent_call_sid:', parentCallSid)
      }
    }

    // Method 3: Match by to_number (outbound calls)
    if (!existingCall && cleanToNumber.length === 10) {
      console.log('Attempting to_number lookup:', { cleanToNumber })

      // Try exact match with normalized 10-digit number
      const { data: callByToNumber } = await supabase
        .from('calls')
        .select('id')
        .eq('direction', 'outbound')
        .gte('started_at', thirtyMinutesAgo)
        .eq('to_number', cleanToNumber)
        .is('call_sid', null) // Prioritize calls without call_sid set yet
        .order('started_at', { ascending: false })
        .limit(1)

      if (callByToNumber && callByToNumber.length > 0) {
        existingCall = callByToNumber[0]
        console.log('Found call by to_number (no call_sid):', cleanToNumber)
      }

      // If not found, try any recent call to this number
      if (!existingCall) {
        const { data: anyCallByToNumber } = await supabase
          .from('calls')
          .select('id')
          .eq('direction', 'outbound')
          .gte('started_at', thirtyMinutesAgo)
          .eq('to_number', cleanToNumber)
          .order('started_at', { ascending: false })
          .limit(1)

        if (anyCallByToNumber && anyCallByToNumber.length > 0) {
          existingCall = anyCallByToNumber[0]
          console.log('Found call by to_number (any):', cleanToNumber)
        }
      }

      // Update call_sid for future lookups if we found a match
      if (existingCall && callSid) {
        await supabase
          .from('calls')
          .update({ call_sid: callSid })
          .eq('id', existingCall.id)
      }
    }

    // Method 4: Match by from_number for inbound calls
    if (!existingCall && cleanFromNumber.length === 10) {
      console.log('Attempting from_number lookup (inbound):', { cleanFromNumber })

      const { data: callByFromNumber } = await supabase
        .from('calls')
        .select('id')
        .eq('direction', 'inbound')
        .gte('started_at', thirtyMinutesAgo)
        .eq('from_number', cleanFromNumber)
        .order('started_at', { ascending: false })
        .limit(1)

      if (callByFromNumber && callByFromNumber.length > 0) {
        existingCall = callByFromNumber[0]
        console.log('Found call by from_number:', cleanFromNumber)

        if (callSid) {
          await supabase
            .from('calls')
            .update({ call_sid: callSid })
            .eq('id', existingCall.id)
        }
      }
    }

    // Method 5: For recording callbacks, find most recent call without recording
    if (!existingCall && recordingUrl) {
      console.log('Recording callback - looking for recent call without recording')

      // First try to match by phone number with any format
      if (cleanToNumber.length >= 7) {
        const { data: recentCallByPhone } = await supabase
          .from('calls')
          .select('id')
          .eq('direction', 'outbound')
          .is('recording_url', null)
          .gte('started_at', thirtyMinutesAgo)
          .ilike('to_number', `%${cleanToNumber.slice(-7)}%`)
          .order('started_at', { ascending: false })
          .limit(1)

        if (recentCallByPhone && recentCallByPhone.length > 0) {
          existingCall = recentCallByPhone[0]
          console.log('Found recent call by partial phone match:', existingCall.id)
        }
      }

      // Last resort: any recent call without recording
      if (!existingCall) {
        const { data: recentCall } = await supabase
          .from('calls')
          .select('id')
          .eq('direction', 'outbound')
          .is('recording_url', null)
          .gte('started_at', thirtyMinutesAgo)
          .order('started_at', { ascending: false })
          .limit(1)

        if (recentCall && recentCall.length > 0) {
          existingCall = recentCall[0]
          console.log('Found recent call without recording (fallback):', existingCall.id)
        }
      }
    }

    if (!existingCall) {
      console.log('No matching call found for:', {
        callSid,
        toNumber: effectiveToNumber,
        cleanToNumber,
        cleanFromNumber,
        recordingUrl: recordingUrl ? 'present' : 'none'
      })
      return NextResponse.json({ success: true, message: 'No matching call' })
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    // Update disposition if we have a call status
    if (callStatus && dispositionMap[callStatus]) {
      updateData.disposition = dispositionMap[callStatus]
      updateData.ended_at = new Date().toISOString()
    }

    // Extract user_id from client identity when a browser client answers
    // Called format for browser clients: "client:FirstName_LastName_userId8chars"
    const calledValue = called || effectiveToNumber
    if (calledValue?.startsWith('client:') && (callStatus === 'in-progress' || callStatus === 'completed')) {
      const clientIdentity = calledValue.replace('client:', '')
      // Extract user ID from identity format: FirstName_LastName_userId8chars
      const parts = clientIdentity.split('_')
      if (parts.length >= 3) {
        const userIdPrefix = parts[parts.length - 1] // Last part is the user ID prefix
        console.log('Extracting user from client identity:', { clientIdentity, userIdPrefix })

        // Find user by ID prefix (fetch all and filter since UUID doesn't support pattern matching)
        const { data: allUsers } = await supabase
          .from('users')
          .select('id')
          .eq('is_deleted', false)
          .limit(50)

        const matchedUser = allUsers?.find(u => u.id.startsWith(userIdPrefix))

        if (matchedUser) {
          updateData.user_id = matchedUser.id
          console.log('Assigned call to user:', matchedUser.id)
        } else {
          console.log('No user found matching prefix:', userIdPrefix)
        }
      }
    }

    // Update duration if provided
    if (duration) {
      updateData.duration_seconds = parseInt(duration)
    }

    // Update recording URL if provided
    if (recordingUrl) {
      updateData.recording_url = recordingUrl
      updateData.ai_analysis_status = 'pending'
    }

    // Apply updates
    await supabase
      .from('calls')
      .update(updateData)
      .eq('id', existingCall.id)

    console.log('Updated call:', existingCall.id, updateData)

    // Trigger AI processing if we have a recording URL
    // We await this to ensure it completes before the serverless function terminates
    // Twilio's RecordingStatus: completed callback only fires when recording is ready
    if (recordingUrl) {
      // Use NEXT_PUBLIC_APP_URL with fallback to localhost for local dev
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
      console.log('Triggering AI processing with baseUrl:', baseUrl)
      await triggerAIProcessing(existingCall.id, baseUrl)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling callback:', error)
    return NextResponse.json({ error: 'Failed to process callback' }, { status: 500 })
  }
}

// Handle GET requests from Twilio (some status callbacks use GET)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const callSid = searchParams.get('CallSid')
  const callStatus = searchParams.get('CallStatus')
  const duration = searchParams.get('CallDuration') || searchParams.get('Duration')

  console.log('Twilio GET callback:', { callSid, callStatus, duration })

  // For GET callbacks, just acknowledge - the important updates come via POST
  return new NextResponse('OK', { status: 200 })
}
