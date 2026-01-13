import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

/**
 * GET /api/twilio/conference-caller
 * Looks up the original caller for a conference-based inbound call
 *
 * Used by the browser when it receives a call from our Twilio number
 * to determine if it's a conference join and get the actual caller info
 */
export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  // Look for the most recent inbound call with conference_based metadata
  // that was created in the last 2 minutes (calls shouldn't take longer to ring)
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const { data: call, error } = await supabase
    .from('calls')
    .select('id, from_number, lead_id, phone_system_metadata')
    .eq('direction', 'inbound')
    .not('phone_system_metadata', 'is', null)
    .gte('started_at', twoMinutesAgo)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !call) {
    console.log('[Conference Caller] No recent conference call found')
    return NextResponse.json({ found: false })
  }

  // Check if it's conference-based
  const metadata = call.phone_system_metadata as { conference_based?: boolean; conference_name?: string } | null
  if (!metadata?.conference_based) {
    console.log('[Conference Caller] Most recent call is not conference-based')
    return NextResponse.json({ found: false })
  }

  console.log('[Conference Caller] Found original caller:', call.from_number)

  // Look up lead info
  let leadInfo = null
  if (call.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, first_name, last_name')
      .eq('id', call.lead_id)
      .single()

    if (lead) {
      leadInfo = {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`.trim(),
        type: 'lead' as const,
      }
    }
  }

  // If no lead_id, try to find by phone number
  if (!leadInfo) {
    const cleanNumber = call.from_number.replace(/\D/g, '').slice(-10)

    const { data: lead } = await supabase
      .from('leads')
      .select('id, first_name, last_name')
      .or(`phone.ilike.%${cleanNumber}%,phone_secondary.ilike.%${cleanNumber}%`)
      .limit(1)
      .single()

    if (lead) {
      leadInfo = {
        id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`.trim(),
        type: 'lead' as const,
      }
    } else {
      // Try contacts
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .or(`phone.ilike.%${cleanNumber}%,phone_secondary.ilike.%${cleanNumber}%`)
        .limit(1)
        .single()

      if (contact) {
        leadInfo = {
          id: contact.id,
          name: `${contact.first_name} ${contact.last_name}`.trim(),
          type: 'contact' as const,
        }
      }
    }
  }

  return NextResponse.json({
    found: true,
    originalCaller: call.from_number,
    conferenceName: metadata.conference_name,
    leadInfo,
  })
}
