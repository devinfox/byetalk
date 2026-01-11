import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import twilio from 'twilio'

// Twilio client for REST API calls
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

// Cache Twilio numbers
let twilioNumbersCache: { phoneNumber: string; areaCode: string }[] | null = null
let cacheTime = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

/**
 * Get all Twilio phone numbers for area code matching
 */
async function getTwilioNumbers(): Promise<{ phoneNumber: string; areaCode: string }[]> {
  const now = Date.now()

  // Check cache
  if (twilioNumbersCache && now - cacheTime < CACHE_TTL) {
    return twilioNumbersCache
  }

  try {
    // Try to get from database first
    const { data: dbNumbers } = await getSupabaseAdmin()
      .from('twilio_phone_numbers')
      .select('phone_number, area_code')
      .eq('is_active', true)

    if (dbNumbers && dbNumbers.length > 0) {
      twilioNumbersCache = dbNumbers.map(n => ({
        phoneNumber: n.phone_number,
        areaCode: n.area_code,
      }))
      cacheTime = now
      return twilioNumbersCache
    }

    // Fallback: fetch from Twilio API
    const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 500 })

    twilioNumbersCache = numbers.map(n => ({
      phoneNumber: n.phoneNumber,
      areaCode: n.phoneNumber.replace(/\D/g, '').slice(1, 4), // +1XXX -> XXX
    }))
    cacheTime = now

    // Update database cache
    const insertData = twilioNumbersCache.map(n => ({
      phone_number: n.phoneNumber,
      area_code: n.areaCode,
      is_active: true,
    }))

    await getSupabaseAdmin()
      .from('twilio_phone_numbers')
      .upsert(insertData, { onConflict: 'phone_number' })

    return twilioNumbersCache
  } catch (err) {
    console.error('[Turbo Dial] Error fetching Twilio numbers:', err)
    // Return main number as fallback
    return [{
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+18186007521',
      areaCode: '818',
    }]
  }
}

/**
 * Get caller ID matching lead's area code
 */
function getMatchingCallerId(leadPhone: string, numbers: { phoneNumber: string; areaCode: string }[]): string {
  const cleanPhone = leadPhone.replace(/\D/g, '')

  // Extract area code from the last 10 digits (handles +1, 1, or raw 10-digit numbers)
  let leadAreaCode: string
  if (cleanPhone.length >= 10) {
    // Get the area code (first 3 of the last 10 digits)
    const last10 = cleanPhone.slice(-10)
    leadAreaCode = last10.slice(0, 3)
  } else {
    leadAreaCode = cleanPhone.slice(0, 3)
  }

  // Try exact area code match
  const exactMatch = numbers.find(n => n.areaCode === leadAreaCode)
  if (exactMatch) {
    return exactMatch.phoneNumber
  }

  // Fallback to main number
  return process.env.TWILIO_PHONE_NUMBER || '+18186007521'
}

/**
 * POST /api/turbo/dial
 * Initiate a batch of calls (3 leads simultaneously)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const batchSize = body.batch_size || 3

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's info and verify turbo session (check both auth_user_id and auth_id) - use admin to bypass RLS
    let userData = null
    const { data: userByAuthUserId } = await getSupabaseAdmin()
      .from('users')
      .select('id, organization_id, first_name, last_name')
      .eq('auth_user_id', user.id)
      .single()

    if (userByAuthUserId) {
      userData = userByAuthUserId
    } else {
      const { data: userByAuthId } = await getSupabaseAdmin()
        .from('users')
        .select('id, organization_id, first_name, last_name')
        .eq('auth_id', user.id)
        .single()
      userData = userByAuthId
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify user has active turbo session
    const { data: session, error: sessionError } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .select('id, calls_made')
      .eq('user_id', userData.id)
      .eq('status', 'active')
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Not in turbo mode' }, { status: 400 })
    }

    // Get base URL for webhooks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    // Get next batch of leads using the helper function
    const { data: batch, error: batchError } = await getSupabaseAdmin()
      .rpc('get_turbo_dial_batch', {
        p_organization_id: userData.organization_id,
        p_batch_size: batchSize,
      })

    if (batchError) {
      console.error('[Turbo Dial] Error getting batch:', batchError)
      return NextResponse.json({ error: 'Failed to get leads' }, { status: 500 })
    }

    if (!batch || batch.length === 0) {
      return NextResponse.json({
        success: true,
        calls_initiated: 0,
        message: 'No leads in queue',
      })
    }

    // Get Twilio numbers for area code matching
    const twilioNumbers = await getTwilioNumbers()

    // Initiate calls for each lead
    const initiatedCalls: {
      lead_id: string
      lead_phone: string
      lead_name: string
      call_sid: string
      caller_id: string
    }[] = []

    for (const lead of batch) {
      try {
        const callerId = getMatchingCallerId(lead.lead_phone, twilioNumbers)

        // Clean the phone number
        let toNumber = lead.lead_phone.replace(/\D/g, '')
        if (toNumber.length === 10) {
          toNumber = `+1${toNumber}`
        } else if (toNumber.length === 11 && toNumber.startsWith('1')) {
          toNumber = `+${toNumber}`
        } else {
          toNumber = `+${toNumber}`
        }

        // Create the outbound call via Twilio REST API
        const call = await twilioClient.calls.create({
          to: toNumber,
          from: callerId,
          url: `${baseUrl}/api/turbo/connect`,
          statusCallback: `${baseUrl}/api/turbo/webhook`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
          machineDetection: 'Enable',
          timeout: 30,
        })

        console.log(`[Turbo Dial] Initiated call to ${lead.lead_name} (${toNumber}) - SID: ${call.sid}`)

        // Create turbo_active_calls record
        await getSupabaseAdmin()
          .from('turbo_active_calls')
          .insert({
            queue_item_id: lead.queue_id,
            organization_id: userData.organization_id,
            call_sid: call.sid,
            caller_id: callerId,
            lead_id: lead.lead_id,
            lead_phone: toNumber,
            lead_name: lead.lead_name,
            status: 'dialing',
            initiated_by: userData.id,
            session_id: session.id,
          })

        // Update queue item status - increment attempts using raw SQL
        await getSupabaseAdmin().rpc('increment_turbo_queue_attempts', {
          p_queue_id: lead.queue_id,
        })

        initiatedCalls.push({
          lead_id: lead.lead_id,
          lead_phone: toNumber,
          lead_name: lead.lead_name,
          call_sid: call.sid,
          caller_id: callerId,
        })
      } catch (callError) {
        console.error(`[Turbo Dial] Failed to call ${lead.lead_name}:`, callError)

        // Mark as failed in queue
        await getSupabaseAdmin()
          .from('turbo_call_queue')
          .update({
            status: 'queued', // Return to queue for retry
            last_attempt_at: new Date().toISOString(),
            last_disposition: 'failed',
          })
          .eq('id', lead.queue_id)
      }
    }

    // Update session stats
    await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .update({
        calls_made: session.calls_made + initiatedCalls.length,
      })
      .eq('id', session.id)

    return NextResponse.json({
      success: true,
      calls_initiated: initiatedCalls.length,
      calls: initiatedCalls,
    })
  } catch (error) {
    console.error('[Turbo Dial] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
