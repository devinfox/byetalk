'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { Device, Call } from '@twilio/voice-sdk'

export type CallStatus = 'idle' | 'connecting' | 'ringing' | 'connected' | 'disconnected' | 'error' | 'incoming'

export interface IncomingCallInfo {
  from: string
  to: string
  callSid: string
}

interface TwilioDeviceContextType {
  device: Device | null
  call: Call | null
  callSid: string | null
  status: CallStatus
  error: string | null
  isMuted: boolean
  isReady: boolean
  incomingCallInfo: IncomingCallInfo | null
  // Call info for display
  currentCallNumber: string | null
  currentCallName: string | null
  currentLeadId: string | null
  currentContactId: string | null
  // Actions
  makeCall: (phoneNumber: string, metadata?: CallMetadata) => Promise<string | null>
  connectToUrl: (twimlUrl: string) => Promise<boolean>
  answerCall: () => void
  rejectCall: () => void
  hangUp: () => void
  toggleMute: () => void
  sendDigits: (digits: string) => void
  setCallMetadata: (metadata: CallMetadata) => void
}

interface CallMetadata {
  phoneNumber?: string
  name?: string
  leadId?: string
  contactId?: string
}

const TwilioDeviceContext = createContext<TwilioDeviceContextType | undefined>(undefined)

export function TwilioDeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [call, setCall] = useState<Call | null>(null)
  const [callSid, setCallSid] = useState<string | null>(null)
  const [status, setStatus] = useState<CallStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [incomingCallInfo, setIncomingCallInfo] = useState<IncomingCallInfo | null>(null)

  // Call metadata for display
  const [currentCallNumber, setCurrentCallNumber] = useState<string | null>(null)
  const [currentCallName, setCurrentCallName] = useState<string | null>(null)
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null)
  const [currentContactId, setCurrentContactId] = useState<string | null>(null)

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
        console.log('[Twilio Context] Device registered and ready for calls')
        setIsReady(true)
        setError(null)
      })

      newDevice.on('error', (twilioError) => {
        console.error('[Twilio Context] Device error:', twilioError)
        setError(twilioError.message)
        setStatus('error')
      })

      newDevice.on('incoming', (incomingCall: Call) => {
        console.log('[Twilio Context] Incoming call:', incomingCall.parameters)

        // Store the incoming call
        incomingCallRef.current = incomingCall

        // Extract caller info
        const from = incomingCall.parameters.From || 'Unknown'
        const to = incomingCall.parameters.To || ''
        const sid = incomingCall.parameters.CallSid || ''

        setIncomingCallInfo({ from, to, callSid: sid })
        setCurrentCallNumber(from)
        setStatus('incoming')

        // Set up incoming call event listeners
        incomingCall.on('cancel', () => {
          console.log('[Twilio Context] Incoming call cancelled')
          setStatus('idle')
          setIncomingCallInfo(null)
          clearCallMetadata()
          incomingCallRef.current = null
        })

        incomingCall.on('disconnect', () => {
          console.log('[Twilio Context] Call disconnected')
          setStatus('disconnected')
          setCall(null)
          setCallSid(null)
          setIsMuted(false)
          setIncomingCallInfo(null)
          incomingCallRef.current = null
          setTimeout(() => {
            setStatus('idle')
            clearCallMetadata()
          }, 1000)
        })

        incomingCall.on('error', (callError) => {
          console.error('[Twilio Context] Call error:', callError)
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

  const clearCallMetadata = () => {
    setCurrentCallNumber(null)
    setCurrentCallName(null)
    setCurrentLeadId(null)
    setCurrentContactId(null)
  }

  const setCallMetadata = useCallback((metadata: CallMetadata) => {
    if (metadata.phoneNumber) setCurrentCallNumber(metadata.phoneNumber)
    if (metadata.name) setCurrentCallName(metadata.name)
    if (metadata.leadId) setCurrentLeadId(metadata.leadId)
    if (metadata.contactId) setCurrentContactId(metadata.contactId)
  }, [])

  const answerCall = useCallback(() => {
    const incomingCall = incomingCallRef.current
    if (!incomingCall) {
      console.error('[Twilio Context] No incoming call to answer')
      return
    }

    try {
      console.log('[Twilio Context] Answering call...')
      incomingCall.accept()

      setCall(incomingCall)
      setCallSid(incomingCall.parameters.CallSid || null)
      setStatus('connected')
      setIncomingCallInfo(null)
    } catch (err) {
      console.error('[Twilio Context] Failed to answer call:', err)
      setError('Failed to answer call')
    }
  }, [])

  const rejectCall = useCallback(() => {
    const incomingCall = incomingCallRef.current
    if (!incomingCall) {
      console.error('[Twilio Context] No incoming call to reject')
      return
    }

    try {
      console.log('[Twilio Context] Rejecting call...')
      incomingCall.reject()

      setStatus('idle')
      setIncomingCallInfo(null)
      clearCallMetadata()
      incomingCallRef.current = null
    } catch (err) {
      console.error('[Twilio Context] Failed to reject call:', err)
      setError('Failed to reject call')
    }
  }, [])

  const makeCall = useCallback(async (phoneNumber: string, metadata?: CallMetadata): Promise<string | null> => {
    if (!deviceRef.current) {
      setError('Device not ready')
      return null
    }

    try {
      setStatus('connecting')
      setError(null)
      setCallSid(null)

      // Set call metadata
      setCurrentCallNumber(phoneNumber)
      if (metadata?.name) setCurrentCallName(metadata.name)
      if (metadata?.leadId) setCurrentLeadId(metadata.leadId)
      if (metadata?.contactId) setCurrentContactId(metadata.contactId)

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
        const ringingSid = outgoingCall.parameters?.CallSid || null
        if (ringingSid) {
          console.log('[Twilio Context] Call ringing, CallSid:', ringingSid)
          setCallSid(ringingSid)
        }
      })

      outgoingCall.on('accept', async () => {
        setStatus('connected')
        const acceptedSid = outgoingCall.parameters?.CallSid || null
        if (acceptedSid) {
          console.log('[Twilio Context] Call accepted, CallSid:', acceptedSid)
          setCallSid(acceptedSid)
        }
      })

      outgoingCall.on('disconnect', () => {
        setStatus('disconnected')
        setCall(null)
        setCallSid(null)
        setIsMuted(false)
        setTimeout(() => {
          setStatus('idle')
          clearCallMetadata()
        }, 1000)
      })

      outgoingCall.on('cancel', () => {
        setStatus('idle')
        setCall(null)
        setCallSid(null)
        setIsMuted(false)
        clearCallMetadata()
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

  // Connect to a TwiML URL (used for turbo mode conference connection)
  const connectToUrl = useCallback(async (twimlUrl: string): Promise<boolean> => {
    if (!deviceRef.current) {
      setError('Device not ready')
      return false
    }

    try {
      setStatus('connecting')
      setError(null)

      console.log('[Twilio Context] Connecting to TwiML URL:', twimlUrl)

      const params = {
        TwimlUrl: twimlUrl,
      }

      const outgoingCall = await deviceRef.current.connect({ params })

      outgoingCall.on('accept', () => {
        console.log('[Twilio Context] Conference connection accepted')
        setStatus('connected')
      })

      outgoingCall.on('disconnect', () => {
        console.log('[Twilio Context] Conference disconnected')
        setStatus('disconnected')
        setCall(null)
        setCallSid(null)
        setIsMuted(false)
        setTimeout(() => {
          setStatus('idle')
          clearCallMetadata()
        }, 500)
      })

      outgoingCall.on('cancel', () => {
        console.log('[Twilio Context] Conference connection cancelled')
        setStatus('idle')
        setCall(null)
        setCallSid(null)
        setIsMuted(false)
        clearCallMetadata()
      })

      outgoingCall.on('error', (callError) => {
        console.error('[Twilio Context] Conference error:', callError)
        setError(callError.message)
        setStatus('error')
        setCall(null)
        setCallSid(null)
      })

      setCall(outgoingCall)
      setCallSid(outgoingCall.parameters?.CallSid || null)
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to conference'
      console.error('[Twilio Context] connectToUrl error:', err)
      setError(errorMessage)
      setStatus('error')
      return false
    }
  }, [])

  const hangUp = useCallback(() => {
    if (call) {
      call.disconnect()
      setCall(null)
      setStatus('idle')
      setIsMuted(false)
      clearCallMetadata()
    }
    // Also handle hanging up on incoming call that hasn't been answered
    if (incomingCallRef.current) {
      incomingCallRef.current.reject()
      incomingCallRef.current = null
      setIncomingCallInfo(null)
      setStatus('idle')
      clearCallMetadata()
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

  const value: TwilioDeviceContextType = {
    device,
    call,
    callSid,
    status,
    error,
    isMuted,
    isReady,
    incomingCallInfo,
    currentCallNumber,
    currentCallName,
    currentLeadId,
    currentContactId,
    makeCall,
    connectToUrl,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
    sendDigits,
    setCallMetadata,
  }

  return (
    <TwilioDeviceContext.Provider value={value}>
      {children}
    </TwilioDeviceContext.Provider>
  )
}

export function useTwilioDeviceContext() {
  const context = useContext(TwilioDeviceContext)
  if (context === undefined) {
    throw new Error('useTwilioDeviceContext must be used within a TwilioDeviceProvider')
  }
  return context
}
