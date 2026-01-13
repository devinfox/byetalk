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

// Lazy Twilio client - created on first use to avoid build-time errors
let twilioClient: ReturnType<typeof twilio> | null = null
function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (accountSid && authToken) {
      twilioClient = twilio(accountSid, authToken)
    }
  }
  return twilioClient
}

/**
 * POST /api/twilio/voice/extension
 * Handles extension dialing - routes to specific user or all users
 * Uses conference-based routing for seamless add-participant support
 */
export async function POST(request: NextRequest) {
  console.log('[Twilio Extension] POST received')

  try {
    const formData = await request.formData()

    const digits = formData.get('Digits') as string | null
    const from = formData.get('From') as string
    const callSid = formData.get('CallSid') as string

    // Get the base URL for callbacks
    const host = request.headers.get('host') || ''
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
    const baseUrl = envUrl.replace(/\/$/, '')
    const statusCallbackUrl = `${baseUrl}/api/twilio/status`

    console.log('[Twilio Extension] Digits entered:', digits, 'From:', from, 'CallSid:', callSid)

    const twiml = new VoiceResponse()
    let targetUser: { id: string; first_name: string; last_name: string } | null = null

    // If digits were entered, try to find user by extension
    if (digits && supabase) {
      const extension = parseInt(digits, 10)

      if (!isNaN(extension)) {
        const { data: user } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .eq('extension', extension)
          .eq('is_active', true)
          .eq('is_deleted', false)
          .single()

        if (user) {
          targetUser = user
          console.log('[Twilio Extension] Found user for extension', extension, ':', user.first_name, user.last_name)
        } else {
          console.log('[Twilio Extension] No user found for extension', extension)
        }
      }
    }

    // Generate a unique conference name for this inbound call
    const conferenceName = `inbound_${callSid}_${Date.now()}`
    console.log('[Twilio Extension] Using conference:', conferenceName)

    // Store conference name and caller info in call record
    if (supabase) {
      supabase
        .from('calls')
        .update({
          phone_system_metadata: {
            conference_name: conferenceName,
            conference_based: true,
            original_caller: from,
          },
        })
        .eq('call_sid', callSid)
        .then(({ error }) => {
          if (error) {
            console.error('[Twilio Extension] Error storing conference info:', error)
          } else {
            console.log('[Twilio Extension] Stored conference info in call record')
          }
        })
    }

    if (targetUser) {
      // Check if target user is in turbo mode (should not be interrupted)
      let isTargetInTurboMode = false
      if (supabase) {
        const { data: turboSession } = await supabase
          .from('turbo_mode_sessions')
          .select('id')
          .eq('user_id', targetUser.id)
          .eq('status', 'active')
          .single()

        isTargetInTurboMode = !!turboSession
      }

      if (isTargetInTurboMode) {
        // User is in turbo mode - don't interrupt them
        console.log('[Twilio Extension] User', targetUser.first_name, 'is in turbo mode, redirecting to other reps')
        twiml.say({ voice: 'alice' }, `Extension ${digits} is currently busy. Please hold while we connect you to another representative.`)
        // Fall through to ring other available users
        twiml.redirect({ method: 'POST' }, `${baseUrl}/api/twilio/voice/extension`)

        return new NextResponse(twiml.toString(), {
          headers: { 'Content-Type': 'text/xml' },
        })
      }

      // Ring specific user by extension
      twiml.say({ voice: 'alice' }, `Connecting you to extension ${digits}.`)

      const clientIdentity = `${targetUser.first_name}_${targetUser.last_name}_${targetUser.id.slice(0, 8)}`
      console.log('[Twilio Extension] Dialing client:', clientIdentity)

      // Put lead into conference
      const dial = twiml.dial({
        action: `${baseUrl}/api/twilio/voice/fallback`,
      })

      dial.conference(
        {
          beep: 'false' as const,
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
          waitUrl: '',
          record: 'record-from-start',
          recordingStatusCallback: statusCallbackUrl,
          recordingStatusCallbackEvent: ['completed'],
          statusCallback: `${baseUrl}/api/twilio/conference/status?conf=${encodeURIComponent(conferenceName)}`,
          statusCallbackEvent: ['start', 'end', 'join', 'leave'],
        },
        conferenceName
      )

      // Call the browser client to join the same conference
      const joinConferenceUrl = `${baseUrl}/api/twilio/join-conference?conference=${encodeURIComponent(conferenceName)}&callerNumber=${encodeURIComponent(from)}`
      const client = getTwilioClient()
      if (client) {
        client.calls.create({
          to: `client:${clientIdentity}`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          url: joinConferenceUrl,
          statusCallback: statusCallbackUrl,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        }).then(call => {
          console.log('[Twilio Extension] Called client:', clientIdentity, 'CallSid:', call.sid)
        }).catch(err => {
          console.error('[Twilio Extension] Error calling client:', err)
        })
      }
    } else {
      // No valid extension - ring all users
      if (digits) {
        twiml.say({ voice: 'alice' }, 'That extension was not found. Please hold while we connect you.')
      } else {
        twiml.say({ voice: 'alice' }, 'Please hold while we connect you.')
      }

      // Get all active users, excluding those in turbo mode
      if (supabase) {
        // First, get users who are currently in turbo mode (should not be interrupted)
        const { data: turboSessions } = await supabase
          .from('turbo_mode_sessions')
          .select('user_id')
          .eq('status', 'active')

        const turboUserIds = new Set(turboSessions?.map(s => s.user_id) || [])
        console.log('[Twilio Extension] Users in turbo mode (excluded):', turboUserIds.size)

        // Get all active users
        const { data: allUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .eq('is_active', true)
          .eq('is_deleted', false)
          .limit(20)

        // Filter out turbo mode users in JavaScript (more reliable than complex SQL)
        const users = allUsers?.filter(u => !turboUserIds.has(u.id)).slice(0, 10) || []
        console.log('[Twilio Extension] Available users after filtering:', users.length)

        if (users && users.length > 0) {
          // Put lead into conference
          const dial = twiml.dial({
            action: `${baseUrl}/api/twilio/voice/fallback`,
          })

          dial.conference(
            {
              beep: 'false' as const,
              startConferenceOnEnter: true,
              endConferenceOnExit: true,
              waitUrl: '',
              record: 'record-from-start',
              recordingStatusCallback: statusCallbackUrl,
              recordingStatusCallbackEvent: ['completed'],
              statusCallback: `${baseUrl}/api/twilio/conference/status?conf=${encodeURIComponent(conferenceName)}`,
              statusCallbackEvent: ['start', 'end', 'join', 'leave'],
            },
            conferenceName
          )

          // Call all browser clients to join the conference
          const joinConferenceUrl = `${baseUrl}/api/twilio/join-conference?conference=${encodeURIComponent(conferenceName)}&callerNumber=${encodeURIComponent(from)}`
          const client = getTwilioClient()

          if (client) {
            for (const user of users) {
              const clientIdentity = `${user.first_name}_${user.last_name}_${user.id.slice(0, 8)}`
              console.log('[Twilio Extension] Calling client to join conference:', clientIdentity)

              client.calls.create({
                to: `client:${clientIdentity}`,
                from: process.env.TWILIO_PHONE_NUMBER!,
                url: joinConferenceUrl,
                statusCallback: statusCallbackUrl,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
              }).then(call => {
                console.log('[Twilio Extension] Called client:', clientIdentity, 'CallSid:', call.sid)
              }).catch(err => {
                console.error('[Twilio Extension] Error calling client:', err)
              })
            }
          }
        } else {
          // No users available, go to voicemail
          twiml.say({ voice: 'alice' }, 'Sorry, no one is available. Please leave a message after the beep.')
          twiml.record({
            maxLength: 120,
            action: `${baseUrl}/api/twilio/voicemail`,
            transcribe: true,
            transcribeCallback: `${baseUrl}/api/twilio/voicemail/transcription`,
          })
        }
      } else {
        twiml.say({ voice: 'alice' }, 'Sorry, we are unable to connect your call at this time.')
      }
    }

    console.log('[Twilio Extension] TwiML generated:', twiml.toString())

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  } catch (error) {
    console.error('[Twilio Extension] Error:', error)
    const twiml = new VoiceResponse()
    twiml.say('An error occurred. Please try again.')

    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }
}
