'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Device, Call } from '@twilio/voice-sdk'

export type CallStatus = 'idle' | 'connecting' | 'ringing' | 'connected' | 'disconnected' | 'error' | 'incoming'

export interface IncomingCallInfo {
  from: string
  to: string
  callSid: string
}

interface UseTwilioDeviceReturn {
  device: Device | null
  call: Call | null
  callSid: string | null
  status: CallStatus
  error: string | null
  isMuted: boolean
  isReady: boolean
  incomingCallInfo: IncomingCallInfo | null
  makeCall: (phoneNumber: string) => Promise<string | null>
  answerCall: () => void
  rejectCall: () => void
  hangUp: () => void
  toggleMute: () => void
  sendDigits: (digits: string) => void
}

export function useTwilioDevice(): UseTwilioDeviceReturn {
  const [device, setDevice] = useState<Device | null>(null)
  const [call, setCall] = useState<Call | null>(null)
  const [callSid, setCallSid] = useState<string | null>(null)
  const [status, setStatus] = useState<CallStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [incomingCallInfo, setIncomingCallInfo] = useState<IncomingCallInfo | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const incomingCallRef = useRef<Call | null>(null)

  // Initialize device on mount
  useEffect(() => {
    initializeDevice()

    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy()
      }
    }
  }, [])

  const initializeDevice = async () => {
    try {
      // Fetch access token from our API
      const response = await fetch('/api/twilio/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to get token')
      }

      const { token } = await response.json()

      // Create new device
      const newDevice = new Device(token, {
        logLevel: 1, // Errors only
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      })

      // Set up device event listeners
      newDevice.on('registered', () => {
        console.log('[Twilio] Device registered and ready for calls')
        setIsReady(true)
        setError(null)
      })

      newDevice.on('error', (twilioError) => {
        console.error('[Twilio] Device error:', twilioError)
        setError(twilioError.message)
        setStatus('error')
      })

      newDevice.on('incoming', (incomingCall: Call) => {
        console.log('[Twilio] Incoming call:', incomingCall.parameters)

        // Store the incoming call
        incomingCallRef.current = incomingCall

        // Extract caller info
        const from = incomingCall.parameters.From || 'Unknown'
        const to = incomingCall.parameters.To || ''
        const sid = incomingCall.parameters.CallSid || ''

        setIncomingCallInfo({ from, to, callSid: sid })
        setStatus('incoming')

        // Set up incoming call event listeners
        incomingCall.on('cancel', () => {
          console.log('[Twilio] Incoming call cancelled')
          setStatus('idle')
          setIncomingCallInfo(null)
          incomingCallRef.current = null
        })

        incomingCall.on('disconnect', () => {
          console.log('[Twilio] Call disconnected')
          setStatus('disconnected')
          setCall(null)
          setCallSid(null)
          setIsMuted(false)
          setIncomingCallInfo(null)
          incomingCallRef.current = null
          setTimeout(() => setStatus('idle'), 1000)
        })

        incomingCall.on('error', (callError) => {
          console.error('[Twilio] Call error:', callError)
          setError(callError.message)
          setStatus('error')
        })
      })

      newDevice.on('tokenWillExpire', async () => {
        // Refresh token before it expires
        try {
          const response = await fetch('/api/twilio/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          const { token: newToken } = await response.json()
          newDevice.updateToken(newToken)
        } catch (err) {
          console.error('Failed to refresh token:', err)
        }
      })

      // Register the device
      await newDevice.register()

      deviceRef.current = newDevice
      setDevice(newDevice)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize device'
      setError(errorMessage)
      console.error('Device initialization error:', err)
    }
  }

  const answerCall = useCallback(() => {
    const incomingCall = incomingCallRef.current
    if (!incomingCall) {
      console.error('[Twilio] No incoming call to answer')
      return
    }

    try {
      console.log('[Twilio] Answering call...')
      incomingCall.accept()

      setCall(incomingCall)
      setCallSid(incomingCall.parameters.CallSid || null)
      setStatus('connected')
      setIncomingCallInfo(null)

      // Play a sound or haptic feedback could be added here
    } catch (err) {
      console.error('[Twilio] Failed to answer call:', err)
      setError('Failed to answer call')
    }
  }, [])

  const rejectCall = useCallback(() => {
    const incomingCall = incomingCallRef.current
    if (!incomingCall) {
      console.error('[Twilio] No incoming call to reject')
      return
    }

    try {
      console.log('[Twilio] Rejecting call...')
      incomingCall.reject()

      setStatus('idle')
      setIncomingCallInfo(null)
      incomingCallRef.current = null
    } catch (err) {
      console.error('[Twilio] Failed to reject call:', err)
      setError('Failed to reject call')
    }
  }, [])

  const makeCall = useCallback(async (phoneNumber: string): Promise<string | null> => {
    if (!deviceRef.current) {
      setError('Device not ready')
      return null
    }

    try {
      setStatus('connecting')
      setError(null)
      setCallSid(null)

      const params = {
        To: phoneNumber,
      }

      const outgoingCall = await deviceRef.current.connect({ params })

      // Get the CallSid from the call parameters
      const sid = outgoingCall.parameters?.CallSid || null
      setCallSid(sid)

      // Set up call event listeners
      outgoingCall.on('ringing', () => {
        setStatus('ringing')
        // Try to get CallSid during ringing if not already set
        const ringingSid = outgoingCall.parameters?.CallSid || null
        if (ringingSid) {
          console.log('[Twilio] Call ringing, CallSid:', ringingSid)
          setCallSid(ringingSid)
        }
      })

      outgoingCall.on('accept', async () => {
        setStatus('connected')
        // Update CallSid when call is accepted - it should be available now
        const acceptedSid = outgoingCall.parameters?.CallSid || null
        if (acceptedSid) {
          console.log('[Twilio] Call accepted, CallSid from SDK:', acceptedSid)
          setCallSid(acceptedSid)
        } else {
          // The SDK might not have the CallSid - fetch it from our server
          console.log('[Twilio] CallSid not available from SDK, fetching from server...')
          // Small delay to allow server to update the call record
          await new Promise(resolve => setTimeout(resolve, 500))
          try {
            const response = await fetch('/api/twilio/active-call')
            if (response.ok) {
              const { callSid: serverCallSid } = await response.json()
              if (serverCallSid) {
                console.log('[Twilio] Got CallSid from server:', serverCallSid)
                setCallSid(serverCallSid)
              }
            }
          } catch (err) {
            console.error('[Twilio] Failed to fetch CallSid from server:', err)
          }
        }
      })

      outgoingCall.on('disconnect', () => {
        setStatus('disconnected')
        setCall(null)
        setCallSid(null)
        setIsMuted(false)
        // Reset to idle after a brief moment
        setTimeout(() => setStatus('idle'), 1000)
      })

      outgoingCall.on('cancel', () => {
        setStatus('idle')
        setCall(null)
        setCallSid(null)
        setIsMuted(false)
      })

      outgoingCall.on('error', (callError) => {
        setError(callError.message)
        setStatus('error')
        setCall(null)
        setCallSid(null)
      })

      setCall(outgoingCall)
      return sid
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to make call'
      setError(errorMessage)
      setStatus('error')
      return null
    }
  }, [])

  const hangUp = useCallback(() => {
    if (call) {
      call.disconnect()
      setCall(null)
      setStatus('idle')
      setIsMuted(false)
    }
    // Also handle hanging up on incoming call that hasn't been answered
    if (incomingCallRef.current) {
      incomingCallRef.current.reject()
      incomingCallRef.current = null
      setIncomingCallInfo(null)
      setStatus('idle')
    }
  }, [call])

  const toggleMute = useCallback(() => {
    if (call) {
      if (isMuted) {
        call.mute(false)
      } else {
        call.mute(true)
      }
      setIsMuted(!isMuted)
    }
  }, [call, isMuted])

  const sendDigits = useCallback((digits: string) => {
    if (call) {
      call.sendDigits(digits)
    }
  }, [call])

  return {
    device,
    call,
    callSid,
    status,
    error,
    isMuted,
    isReady,
    incomingCallInfo,
    makeCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
    sendDigits,
  }
}
