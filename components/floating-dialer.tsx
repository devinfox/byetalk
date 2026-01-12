'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Delete,
  X,
  Minimize2,
  Maximize2,
  UserPlus,
} from 'lucide-react'
import { useTwilioDeviceContext, CallStatus } from '@/lib/twilio-device-context'
import { createClient } from '@/lib/supabase'
import { useDialer } from '@/lib/dialer-context'
import { IncomingCallModal } from './incoming-call-modal'
import { AddToCallModal } from './add-to-call-modal'

interface FloatingDialerProps {
  userId?: string
}

const dialPadKeys = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

export function FloatingDialer({ userId }: FloatingDialerProps) {
  const { isOpen, phoneNumber, entityInfo, closeDialer, setPhoneNumber, openDialer } = useDialer()
  const [isMinimized, setIsMinimized] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [showAddToCall, setShowAddToCall] = useState(false)
  const [addingParticipant, setAddingParticipant] = useState(false)
  const ringtoneRef = useRef<{ oscillator: OscillatorNode; gainNode: GainNode; context: AudioContext } | null>(null)
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const {
    status,
    error,
    isMuted,
    isReady,
    callSid,
    incomingCallInfo,
    currentCallNumber,
    currentCallName,
    makeCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
    sendDigits,
  } = useTwilioDeviceContext()

  // Play/stop ringtone for incoming calls using Web Audio API
  useEffect(() => {
    const startRingtone = () => {
      try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime) // A4 note
        gainNode.gain.setValueAtTime(0, audioContext.currentTime)

        oscillator.start()

        // Create ring pattern: ring for 1s, pause for 2s
        const ringPattern = () => {
          const now = audioContext.currentTime
          // Ring on
          gainNode.gain.setValueAtTime(0.3, now)
          oscillator.frequency.setValueAtTime(440, now)
          // Short pause between double ring
          gainNode.gain.setValueAtTime(0, now + 0.4)
          // Second ring
          gainNode.gain.setValueAtTime(0.3, now + 0.5)
          oscillator.frequency.setValueAtTime(480, now + 0.5) // Slightly higher pitch
          // Ring off
          gainNode.gain.setValueAtTime(0, now + 0.9)
        }

        ringPattern()
        ringtoneIntervalRef.current = setInterval(ringPattern, 3000)

        ringtoneRef.current = { oscillator, gainNode, context: audioContext }
      } catch (e) {
        console.log('Could not play ringtone:', e)
      }
    }

    const stopRingtone = () => {
      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current)
        ringtoneIntervalRef.current = null
      }
      if (ringtoneRef.current) {
        ringtoneRef.current.oscillator.stop()
        ringtoneRef.current.context.close()
        ringtoneRef.current = null
      }
    }

    if (status === 'incoming' && incomingCallInfo) {
      startRingtone()
    } else {
      stopRingtone()
    }

    return () => {
      stopRingtone()
    }
  }, [status, incomingCallInfo])

  // Reset call duration when call ends
  useEffect(() => {
    if (status === 'connected') {
      const timer = setInterval(() => {
        setCallDuration((prev) => prev + 1)
      }, 1000)
      return () => clearInterval(timer)
    } else if (status === 'idle' || status === 'disconnected') {
      setCallDuration(0)
    }
  }, [status])

  // Handle dial pad key press
  const handleKeyPress = (key: string) => {
    if (status === 'connected') {
      sendDigits(key)
    } else {
      setPhoneNumber(phoneNumber + key)
    }
  }

  // Handle backspace
  const handleBackspace = () => {
    setPhoneNumber(phoneNumber.slice(0, -1))
  }

  // Handle call initiation
  const handleCall = async () => {
    if (!phoneNumber.trim()) return

    const supabase = createClient()

    // Normalize phone number to just digits (last 10) for consistent matching
    const cleanedDigits = phoneNumber.replace(/\D/g, '').slice(-10)
    const normalizedPhone = cleanedDigits.length === 10 ? cleanedDigits : phoneNumber

    // Log call to database with lead/contact association
    const insertData = {
      direction: 'outbound' as const,
      from_number: '+18188623503',
      to_number: normalizedPhone,
      user_id: userId || null,
      lead_id: entityInfo?.leadId || null,
      contact_id: entityInfo?.contactId || null,
      started_at: new Date().toISOString(),
    }
    console.log('Creating call record with data:', insertData)
    const { data: callRecord, error: insertError } = await supabase.from('calls').insert(insertData).select('id').single()

    if (insertError) {
      console.error('Failed to create call record:', JSON.stringify(insertError, null, 2))
    } else {
      console.log('Call record created:', callRecord)
    }

    // Make the call and get the CallSid
    const sid = await makeCall(phoneNumber)

    // Update the call record with the CallSid
    if (callRecord && sid) {
      await supabase.from('calls').update({
        call_sid: sid,
      }).eq('id', callRecord.id)
    }
  }

  // Handle answering incoming call
  const handleAnswer = () => {
    answerCall()
    // Open the dialer to show call controls
    openDialer()
    setPhoneNumber(incomingCallInfo?.from || '')
  }

  // Handle rejecting incoming call
  const handleReject = () => {
    rejectCall()
  }

  // Handle hang up
  const handleHangUp = () => {
    hangUp()
    setCallDuration(0)
    setShowAddToCall(false)
  }

  // Handle adding a participant to the call
  const handleAddParticipant = async (colleague: { id: string; first_name: string; last_name: string }) => {
    if (!callSid) {
      throw new Error('No active call')
    }

    setAddingParticipant(true)
    try {
      const response = await fetch('/api/twilio/add-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callSid,
          colleagueId: colleague.id,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add participant')
      }

      const result = await response.json()
      console.log('[Dialer] Added participant to call:', result)
    } finally {
      setAddingParticipant(false)
    }
  }

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get status display info
  const getStatusInfo = (callStatus: CallStatus) => {
    switch (callStatus) {
      case 'connecting':
        return { text: 'Connecting...', color: 'text-yellow-400' }
      case 'ringing':
        return { text: 'Ringing...', color: 'text-blue-400' }
      case 'connected':
        return { text: formatDuration(callDuration), color: 'text-green-400' }
      case 'disconnected':
        return { text: 'Call ended', color: 'text-gray-400' }
      case 'error':
        return { text: 'Error', color: 'text-red-400' }
      case 'incoming':
        return { text: 'Incoming...', color: 'text-green-400' }
      default:
        return { text: 'Ready', color: 'text-gray-400' }
    }
  }

  const statusInfo = getStatusInfo(status)
  const isInCall = ['connecting', 'ringing', 'connected'].includes(status)

  // Display name: prefer entity info, then current call name, then phone number
  const displayName = entityInfo?.entityName || currentCallName || (isInCall ? currentCallNumber || phoneNumber : null)

  // Show incoming call modal
  if (status === 'incoming' && incomingCallInfo) {
    return (
      <IncomingCallModal
        callInfo={incomingCallInfo}
        onAnswer={handleAnswer}
        onReject={handleReject}
      />
    )
  }

  // Show dialer if explicitly opened OR if there's an active call
  if (!isOpen && !isInCall) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`bg-gray-800 rounded-xl border border-gray-700 shadow-2xl transition-all duration-200 ${
          isMinimized ? 'w-64' : 'w-80'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className={`w-4 h-4 flex-shrink-0 ${isInCall ? 'text-green-400' : 'text-gray-400'}`} />
            <div className="min-w-0">
              <span className="text-white font-medium text-sm truncate">
                {isInCall && displayName ? displayName : entityInfo?.entityName ? `Call ${entityInfo.entityName}` : 'Dialer'}
              </span>
            </div>
            {isInCall && (
              <span className={`text-xs ${statusInfo.color}`}>{statusInfo.text}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              {isMinimized ? (
                <Maximize2 className="w-4 h-4" />
              ) : (
                <Minimize2 className="w-4 h-4" />
              )}
            </button>
            {!isInCall && (
              <button
                onClick={closeDialer}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {!isMinimized && (
          <div className="p-4">
            {/* Error display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-400 px-3 py-2 rounded-lg text-xs mb-3">
                {error}
              </div>
            )}

            {/* Status indicator */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  isReady ? 'bg-green-500' : 'bg-yellow-500'
                }`}
              />
              <span className="text-xs text-gray-400">
                {isReady ? 'Ready to call' : 'Initializing...'}
              </span>
            </div>

            {/* Phone number display */}
            <div className="bg-gray-900 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center justify-between">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d+*#]/g, ''))}
                  placeholder="Enter phone number"
                  className="flex-1 bg-transparent text-white text-lg font-mono focus:outline-none"
                  disabled={isInCall}
                />
                {phoneNumber && !isInCall && (
                  <button
                    onClick={handleBackspace}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isInCall && (
                <div className={`text-center mt-1 text-sm ${statusInfo.color}`}>
                  {statusInfo.text}
                </div>
              )}
            </div>

            {/* Dial pad */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {dialPadKeys.flat().map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="py-3 text-lg font-semibold text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Call controls */}
            <div className="flex justify-center gap-3">
              {isInCall ? (
                <>
                  <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full transition-colors ${
                      isMuted
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <MicOff className="w-5 h-5 text-white" />
                    ) : (
                      <Mic className="w-5 h-5 text-white" />
                    )}
                  </button>
                  <button
                    onClick={() => setShowAddToCall(true)}
                    disabled={status !== 'connected' || addingParticipant}
                    className="p-3 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Add colleague to call"
                  >
                    <UserPlus className="w-5 h-5 text-black" />
                  </button>
                  <button
                    onClick={handleHangUp}
                    className="p-3 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
                    title="End call"
                  >
                    <PhoneOff className="w-5 h-5 text-white" />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCall}
                  disabled={!isReady || !phoneNumber.trim()}
                  className="p-3 bg-green-500 hover:bg-green-600 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Phone className="w-5 h-5 text-white" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Minimized state - show call controls if in call */}
        {isMinimized && isInCall && (
          <div className="p-3 flex items-center justify-center gap-3">
            <button
              onClick={toggleMute}
              className={`p-2 rounded-full transition-colors ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {isMuted ? (
                <MicOff className="w-4 h-4 text-white" />
              ) : (
                <Mic className="w-4 h-4 text-white" />
              )}
            </button>
            <button
              onClick={() => setShowAddToCall(true)}
              disabled={status !== 'connected'}
              className="p-2 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors disabled:opacity-50"
              title="Add colleague"
            >
              <UserPlus className="w-4 h-4 text-black" />
            </button>
            <button
              onClick={handleHangUp}
              className="p-2 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
            >
              <PhoneOff className="w-4 h-4 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Add to Call Modal */}
      <AddToCallModal
        isOpen={showAddToCall}
        onClose={() => setShowAddToCall(false)}
        callSid={callSid}
        onAddParticipant={handleAddParticipant}
      />
    </div>
  )
}
