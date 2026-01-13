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

    console.log('[Twilio Extension] Digits entered:', digits)

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
    // This allows seamless add-participant later
    const conferenceName = `inbound_${callSid}_${Date.now()}`
    console.log('[Twilio Extension] Using conference-based routing:', conferenceName)

    // Store conference name in call record for later lookup
    if (supabase) {
      supabase
        .from('calls')
        .update({
          phone_system_metadata: {
            conference_name: conferenceName,
            conference_based: true,
          },
        })
        .eq('call_sid', callSid)
        .then(({ error }) => {
          if (error) {
            console.error('[Twilio Extension] Error storing conference name:', error)
          } else {
            console.log('[Twilio Extension] Stored conference name in call record')
          }
        })
    }

    if (targetUser) {
      // Ring specific user by extension
      twiml.say({ voice: 'alice' }, `Connecting you to extension ${digits}.`)

      // Put the inbound caller (lead) into a conference
      const dial = twiml.dial({
        action: `${baseUrl}/api/twilio/voice/fallback`,
      })
      dial.conference({
        beep: 'false',
        startConferenceOnEnter: true,
        endConferenceOnExit: true, // End conference when lead hangs up
        waitUrl: '', // No hold music
        record: 'record-from-start',
        recordingStatusCallback: statusCallbackUrl,
        recordingStatusCallbackEvent: ['completed'],
        statusCallback: `${baseUrl}/api/twilio/conference/status?conf=${encodeURIComponent(conferenceName)}`,
        statusCallbackEvent: ['start', 'end', 'join', 'leave'],
      }, conferenceName)

      // Call the target user's browser to join the same conference
      const clientIdentity = `${targetUser.first_name}_${targetUser.last_name}_${targetUser.id.slice(0, 8)}`
      console.log('[Twilio Extension] Calling client to join conference:', clientIdentity)

      // Use fire-and-forget to call the client (don't await)
      // Pass caller info in the TwiML URL so browser knows who's calling
      const joinConferenceUrl = `${baseUrl}/api/twilio/join-conference?conference=${encodeURIComponent(conferenceName)}&callerNumber=${encodeURIComponent(from)}`
      const client = getTwilioClient()
      if (client) {
        // Pass custom parameters so the browser SDK can access the real caller info
        client.calls.create({
          to: `client:${clientIdentity}`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          url: joinConferenceUrl,
          statusCallback: statusCallbackUrl,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          // Custom parameters that get passed to the client SDK
          machineDetection: undefined, // Clear any AMD settings
        }).then(call => {
          console.log('[Twilio Extension] Called client:', clientIdentity, 'CallSid:', call.sid, 'Original caller:', from)
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

      // Get all active users
      if (supabase) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .eq('is_active', true)
          .eq('is_deleted', false)
          .limit(10)

        if (users && users.length > 0) {
          // Put the inbound caller (lead) into a conference
          const dial = twiml.dial({
            action: `${baseUrl}/api/twilio/voice/fallback`,
          })
          dial.conference({
            beep: 'false',
            startConferenceOnEnter: true,
            endConferenceOnExit: true, // End conference when lead hangs up
            waitUrl: '', // No hold music
            record: 'record-from-start',
            recordingStatusCallback: statusCallbackUrl,
            recordingStatusCallbackEvent: ['completed'],
            statusCallback: `${baseUrl}/api/twilio/conference/status?conf=${encodeURIComponent(conferenceName)}`,
            statusCallbackEvent: ['start', 'end', 'join', 'leave'],
          }, conferenceName)

          // Call all users' browsers to join the conference
          // First one to answer will be in the conference with the lead
          // Pass caller info in the TwiML URL so browser knows who's calling
          const joinConferenceUrl = `${baseUrl}/api/twilio/join-conference?conference=${encodeURIComponent(conferenceName)}&callerNumber=${encodeURIComponent(from)}`
          const client = getTwilioClient()

          if (client) {
            for (const user of users) {
              const clientIdentity = `${user.first_name}_${user.last_name}_${user.id.slice(0, 8)}`
              console.log('[Twilio Extension] Calling client to join conference:', clientIdentity, 'Original caller:', from)

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
