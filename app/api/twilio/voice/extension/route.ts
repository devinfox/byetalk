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

/**
 * POST /api/twilio/voice/extension
 * Handles extension dialing - routes to specific user or all users
 * Uses direct <Dial><Client> for reliable audio bridging
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

    // Store caller info in call record for the incoming-call-modal to look up
    if (supabase) {
      supabase
        .from('calls')
        .update({
          phone_system_metadata: {
            original_caller: from,
            inbound: true,
          },
        })
        .eq('call_sid', callSid)
        .then(({ error }) => {
          if (error) {
            console.error('[Twilio Extension] Error storing caller info:', error)
          }
        })
    }

    if (targetUser) {
      // Ring specific user by extension
      twiml.say({ voice: 'alice' }, `Connecting you to extension ${digits}.`)

      // Build client identity
      const clientIdentity = `${targetUser.first_name}_${targetUser.last_name}_${targetUser.id.slice(0, 8)}`
      console.log('[Twilio Extension] Dialing client:', clientIdentity)

      // Direct dial to browser client - creates reliable audio bridge
      const dial = twiml.dial({
        callerId: from, // Show the original caller's number
        answerOnBridge: true,
        record: 'record-from-answer-dual',
        recordingStatusCallback: statusCallbackUrl,
        recordingStatusCallbackEvent: ['completed'],
        action: `${baseUrl}/api/twilio/voice/fallback`,
      })

      dial.client(
        {
          statusCallback: statusCallbackUrl,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        },
        clientIdentity
      )
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
          // Dial all users - first to answer gets connected
          const dial = twiml.dial({
            callerId: from, // Show the original caller's number
            answerOnBridge: true,
            record: 'record-from-answer-dual',
            recordingStatusCallback: statusCallbackUrl,
            recordingStatusCallbackEvent: ['completed'],
            action: `${baseUrl}/api/twilio/voice/fallback`,
          })

          for (const user of users) {
            const clientIdentity = `${user.first_name}_${user.last_name}_${user.id.slice(0, 8)}`
            console.log('[Twilio Extension] Adding client to dial:', clientIdentity)

            dial.client(
              {
                statusCallback: statusCallbackUrl,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
              },
              clientIdentity
            )
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
