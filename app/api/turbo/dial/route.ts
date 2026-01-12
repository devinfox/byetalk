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
      areaCode: n.phoneNumber.replace(/\D/g, '').slice(1, 4),
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

  let leadAreaCode: string
  if (cleanPhone.length >= 10) {
    const last10 = cleanPhone.slice(-10)
    leadAreaCode = last10.slice(0, 3)
  } else {
    leadAreaCode = cleanPhone.slice(0, 3)
  }

  const exactMatch = numbers.find(n => n.areaCode === leadAreaCode)
  if (exactMatch) {
    return exactMatch.phoneNumber
  }

  return process.env.TWILIO_PHONE_NUMBER || '+18186007521'
}

/**
 * POST /api/turbo/dial
 * Pool-based predictive dialer
 * Dials 3 leads per available rep in turbo mode
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const leadsPerRep = body.leads_per_rep || 3

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's info
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

    // CLEANUP: Release any stale sessions (reps marked as "on call" but call has ended)
    // This fixes the issue where reps get stuck and can't receive new calls
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: staleSessions } = await getSupabaseAdmin()
      .from('turbo_mode_sessions')
      .select('id, current_call_sid, last_call_started_at')
      .eq('organization_id', userData.organization_id)
      .eq('status', 'active')
      .not('current_call_sid', 'is', null)
      .lt('last_call_started_at', fiveMinutesAgo)

    if (staleSessions && staleSessions.length > 0) {
      console.log(`[Turbo Dial] Found ${staleSessions.length} potentially stale sessions, checking...`)

      for (const staleSession of staleSessions) {
        // Check if the call is actually still active in turbo_active_calls
        const { data: activeCall } = await getSupabaseAdmin()
          .from('turbo_active_calls')
          .select('id, status')
          .eq('call_sid', staleSession.current_call_sid)
          .single()

        // If call doesn't exist or is in a terminal state, release the rep
        const terminalStatuses = ['completed', 'failed', 'busy', 'no_answer', 'machine', 'canceled', 'voicemail']
        if (!activeCall || terminalStatuses.includes(activeCall.status)) {
          console.log(`[Turbo Dial] Releasing stale session ${staleSession.id} (call ${staleSession.current_call_sid} is ${activeCall?.status || 'not found'})`)
          await getSupabaseAdmin().rpc('release_turbo_rep', {
            p_session_id: staleSession.id,
          })
        }
      }
    }

    // Count available reps (those in turbo mode and not on a call)
    const { data: availableCount, error: countError } = await getSupabaseAdmin()
      .rpc('count_available_turbo_reps', {
        p_organization_id: userData.organization_id,
      })

    console.log(`[Turbo Dial] count_available_turbo_reps result: ${availableCount}, error: ${countError?.message || 'none'}`)

    if (!availableCount || availableCount === 0) {
      // Log why no reps are available for debugging
      const { data: sessions } = await getSupabaseAdmin()
        .from('turbo_mode_sessions')
        .select('id, user_id, status, conference_name, current_call_sid')
        .eq('organization_id', userData.organization_id)
        .eq('status', 'active')

      console.log(`[Turbo Dial] No available reps. Active sessions:`, sessions?.map(s => ({
        id: s.id,
        hasConference: !!s.conference_name,
        onCall: !!s.current_call_sid,
      })))

      return NextResponse.json({
        success: true,
        calls_initiated: 0,
        message: 'No reps available in turbo mode',
        debug: {
          activeSessions: sessions?.length || 0,
          sessionsWithConference: sessions?.filter(s => s.conference_name).length || 0,
          sessionsOnCall: sessions?.filter(s => s.current_call_sid).length || 0,
        },
      })
    }

    // Calculate how many leads to dial
    const batchSize = availableCount * leadsPerRep

    console.log(`[Turbo Dial] ${availableCount} reps available, dialing ${batchSize} leads`)

    // Get base URL for webhooks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`

    // Get next batch of leads
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
      // Log why no leads were returned for debugging
      const { data: queueStats } = await getSupabaseAdmin()
        .from('turbo_call_queue')
        .select('status')
        .eq('organization_id', userData.organization_id)

      const statusCounts = queueStats?.reduce((acc, q) => {
        acc[q.status] = (acc[q.status] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      console.log(`[Turbo Dial] No leads returned. Queue status breakdown:`, statusCounts)

      return NextResponse.json({
        success: true,
        calls_initiated: 0,
        message: 'No leads in queue',
        debug: {
          queueStatusCounts: statusCounts,
        },
      })
    }

    console.log(`[Turbo Dial] Got ${batch.length} leads from batch`)

    // Generate batch ID to group these calls
    const batchId = crypto.randomUUID()

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
        // URL points to /api/turbo/lead-answered which handles atomic rep claiming
        // AMD (Answering Machine Detection) is enabled to filter out voicemails
        const call = await twilioClient.calls.create({
          to: toNumber,
          from: callerId,
          url: `${baseUrl}/api/turbo/lead-answered`,
          statusCallback: `${baseUrl}/api/turbo/webhook`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
          machineDetection: 'DetectMessageEnd', // Better detection - waits for beep
          machineDetectionTimeout: 5, // 5 seconds max to detect
          asyncAmd: 'false', // Synchronous - AnsweredBy comes with initial webhook
          timeout: 30,
        })

        console.log(`[Turbo Dial] Initiated call to ${lead.lead_name} (${toNumber}) - SID: ${call.sid}`)

        // Create turbo_active_calls record with batch ID
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
            batch_id: batchId,
          })

        // Update queue item - increment attempts
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

        // Return to queue for retry
        await getSupabaseAdmin()
          .from('turbo_call_queue')
          .update({
            status: 'queued',
            last_attempt_at: new Date().toISOString(),
            last_disposition: 'failed',
          })
          .eq('id', lead.queue_id)
      }
    }

    // Increment calls_made counter for the user's session
    if (initiatedCalls.length > 0) {
      try {
        const { data: userSession } = await getSupabaseAdmin()
          .from('turbo_mode_sessions')
          .select('id')
          .eq('user_id', userData.id)
          .eq('status', 'active')
          .single()

        if (userSession) {
          const { error: rpcError } = await getSupabaseAdmin().rpc('increment_turbo_session_dialed', {
            p_session_id: userSession.id,
            p_count: initiatedCalls.length,
          })
          if (rpcError) {
            console.log('[Turbo Dial] Could not increment calls_made:', rpcError.message)
          }
        }
      } catch (err) {
        // Function might not exist yet, that's OK
        console.log('[Turbo Dial] Error incrementing calls_made:', err)
      }
    }

    return NextResponse.json({
      success: true,
      available_reps: availableCount,
      calls_initiated: initiatedCalls.length,
      batch_id: batchId,
      calls: initiatedCalls,
    })
  } catch (error) {
    console.error('[Turbo Dial] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
