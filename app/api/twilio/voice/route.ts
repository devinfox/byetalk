import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const VoiceResponse = twilio.twiml.VoiceResponse

// Supabase admin client for querying users
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

// Cache for active users - refresh every 5 minutes
let cachedUsers: { id: string; first_name: string; last_name: string }[] | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getActiveUsers() {
  const now = Date.now()

  // Check if Supabase client is available
  if (!supabase) {
    console.error('[Twilio Voice] Supabase client not initialized! Missing env vars.')
    return []
  }

  // Check cache first (but only if we have actual users cached)
  if (cachedUsers && cachedUsers.length > 0 && now - cacheTime < CACHE_TTL) {
    return cachedUsers
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .limit(10)

    if (error) {
      console.error('[Twilio Voice] Error fetching users:', error)
      return []
    }

    // Only cache if we actually got users (don't cache empty results)
    if (users && users.length > 0) {
      cachedUsers = users
      cacheTime = now
    }

    return users || []
  } catch (err) {
    console.error('[Twilio Voice] Exception fetching users:', err)
    return []
  }
}

// Background task to log call (fire and forget)
function logInboundCallAsync(from: string, callSid: string, callerId: string | undefined) {
  if (!supabase) return

  const cleanFromNumber = from.replace(/\D/g, '').slice(-10)

  // Fire and forget - don't await
  Promise.resolve().then(async () => {
    try {
      // Try to find the lead
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .or(`phone.ilike.%${cleanFromNumber}%,phone_secondary.ilike.%${cleanFromNumber}%`)
        .limit(1)
        .single()

      // Create call record
      await supabase.from('calls').insert({
        direction: 'inbound',
        from_number: cleanFromNumber,
        to_number: callerId?.replace(/\D/g, '').slice(-10) || '',
        call_sid: callSid,
        lead_id: lead?.id || null,
        started_at: new Date().toISOString(),
      })
      console.log('[Twilio Voice] Inbound call logged to database')
    } catch (err) {
      console.error('[Twilio Voice] Failed to log inbound call:', err)
    }
  })
}

export async function POST(request: NextRequest) {
  console.log('[Twilio Voice] POST received')

  try {
    const formData = await request.formData()

    const to = formData.get('To') as string
    const from = formData.get('From') as string
    const direction = formData.get('Direction') as string
    const callSid = formData.get('CallSid') as string
    const callerId = process.env.TWILIO_PHONE_NUMBER

    // Get the base URL for callbacks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
    const baseUrl = envUrl.replace(/\/$/, '')
    const statusCallbackUrl = `${baseUrl}/api/twilio/status`

    console.log('[Twilio Voice] Call:', { to, from, direction, callSid })

    const twiml = new VoiceResponse()

    // Determine call type:
    // - Outbound from browser: from starts with "client:", to is a phone number
    // - Inbound to Twilio number: to matches our Twilio number
    const isOutboundFromBrowser = from?.startsWith('client:') && to && to !== callerId
    const isInboundCall = !isOutboundFromBrowser && (to === callerId || direction === 'inbound')

    console.log('[Twilio Voice] Call type:', { isOutboundFromBrowser, isInboundCall })

    if (isInboundCall) {
      console.log('[Twilio Voice] Inbound call from:', from)

      // Log call asynchronously (don't wait)
      logInboundCallAsync(from, callSid, callerId)

      // Play IVR greeting and gather extension
      const gather = twiml.gather({
        numDigits: 3,
        timeout: 3,
        action: `${baseUrl}/api/twilio/voice/extension`,
        method: 'POST',
      })
      gather.say({ voice: 'alice' }, 'Thank you for calling. If you know your party\'s extension, please dial it now.')

      // If no input, fall through to ring all users
      // Redirect to extension handler with empty digits (will ring all)
      twiml.redirect({ method: 'POST' }, `${baseUrl}/api/twilio/voice/extension`)
    } else if (isOutboundFromBrowser || to) {
      // Outbound call from browser
      console.log('[Twilio Voice] Handling outbound call to:', to)

      // Clean the phone number - handle various formats
      let cleanedNumber = to.replace(/\D/g, '') // Remove non-digits

      // Handle different formats: 8182092305, 18182092305, +18182092305
      if (cleanedNumber.length === 10) {
        cleanedNumber = `+1${cleanedNumber}` // Add +1 for 10-digit numbers
      } else if (cleanedNumber.length === 11 && cleanedNumber.startsWith('1')) {
        cleanedNumber = `+${cleanedNumber}` // Already has country code, just add +
      } else if (to.startsWith('+')) {
        cleanedNumber = to // Already properly formatted
      } else {
        cleanedNumber = `+${cleanedNumber}` // Add + for other formats
      }

      console.log('[Twilio Voice] Cleaned number:', { original: to, cleaned: cleanedNumber })

      const dial = twiml.dial({
        callerId: callerId,
        answerOnBridge: true,
        record: 'record-from-answer-dual',
        recordingStatusCallback: statusCallbackUrl,
        recordingStatusCallbackEvent: ['completed'],
        action: `${baseUrl}/api/twilio/voice/fallback`,
      })

      dial.number({
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      }, cleanedNumber)
    } else {
      twiml.say('No phone number provided.')
    }

    console.log('[Twilio Voice] TwiML generated:', twiml.toString())

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  } catch (error) {
    console.error('[Twilio Voice] Error:', error)
    const twiml = new VoiceResponse()
    twiml.say('An error occurred. Please try again.')

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }
}

// Handle GET for testing
export async function GET() {
  const twiml = new VoiceResponse()
  twiml.say('This endpoint is for Twilio voice calls.')

  return new NextResponse(twiml.toString(), {
    headers: {
      'Content-Type': 'text/xml',
    },
  })
}
