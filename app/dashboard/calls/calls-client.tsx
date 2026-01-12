'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Delete,
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  Search,
  Zap,
  UserPlus,
  Loader2,
} from 'lucide-react'
import { useTwilioDeviceContext, CallStatus } from '@/lib/twilio-device-context'
import { createClient } from '@/lib/supabase'
import type { Lead, User as UserType } from '@/types/database.types'
import { TurboModeToggle } from '@/components/turbo-mode-toggle'
import { TurboQueuePanel } from '@/components/turbo-queue-panel'
import { TurboActiveCallsPanel } from '@/components/turbo-active-calls'
import { AddToCallModal } from '@/components/add-to-call-modal'

interface RecentCall {
  id: string
  direction: string
  disposition: string
  from_number: string
  to_number: string
  duration_seconds: number
  started_at: string
  lead: Pick<Lead, 'id' | 'first_name' | 'last_name'>[] | Pick<Lead, 'id' | 'first_name' | 'last_name'> | null
}

interface CallsClientProps {
  leads: Pick<Lead, 'id' | 'first_name' | 'last_name' | 'email' | 'phone'>[]
  recentCalls: RecentCall[]
  currentUser: UserType | null
  initialPhone?: string
}

const dialPadKeys = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

export function CallsClient({ leads, recentCalls, currentUser, initialPhone }: CallsClientProps) {
  const router = useRouter()
  const [phoneNumber, setPhoneNumber] = useState(initialPhone?.replace(/\D/g, '') || '')
  const [leadSearch, setLeadSearch] = useState('')
  const [callStartTime, setCallStartTime] = useState<Date | null>(null)
  const [callDuration, setCallDuration] = useState(0)
  const [showAddToCall, setShowAddToCall] = useState(false)
  const [addingParticipant, setAddingParticipant] = useState(false)

  // Check if user is admin/manager
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const {
    status,
    error,
    isMuted,
    isReady,
    callSid,
    makeCall,
    hangUp,
    toggleMute,
    sendDigits,
    setCallMetadata,
  } = useTwilioDeviceContext()

  // Filter leads based on search
  const filteredLeads = leads.filter((lead) => {
    const searchLower = leadSearch.toLowerCase()
    return (
      lead.first_name?.toLowerCase().includes(searchLower) ||
      lead.last_name?.toLowerCase().includes(searchLower) ||
      lead.phone?.includes(leadSearch)
    )
  })

  // Handle dial pad key press
  const handleKeyPress = (key: string) => {
    if (status === 'connected') {
      // Send DTMF tone during active call
      sendDigits(key)
    } else {
      // Add to phone number when not in call
      setPhoneNumber((prev) => prev + key)
    }
  }

  // Handle backspace
  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1))
  }

  // Handle call initiation
  const handleCall = async () => {
    if (!phoneNumber.trim()) return

    const supabase = createClient()

    // Normalize phone number to just digits (last 10) for consistent matching
    const cleanedDigits = phoneNumber.replace(/\D/g, '').slice(-10)
    const normalizedPhone = cleanedDigits.length === 10 ? cleanedDigits : phoneNumber

    // Log call to database (disposition is set when call completes via webhook)
    const { data: callRecord } = await supabase
      .from('calls')
      .insert({
        direction: 'outbound',
        from_number: '+18188623503',
        to_number: normalizedPhone,
        user_id: currentUser?.id,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    setCallStartTime(new Date())

    // Start call timer
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1000)

    // Make the call and get the CallSid
    const twilioCallSid = await makeCall(phoneNumber)

    // Update the call record with the CallSid for webhook matching
    if (callRecord?.id && twilioCallSid) {
      await supabase
        .from('calls')
        .update({ call_sid: twilioCallSid })
        .eq('id', callRecord.id)
    }

    // Store timer for cleanup
    ;(window as unknown as { callTimer: NodeJS.Timeout }).callTimer = timer
  }

  // Handle hang up
  const handleHangUp = () => {
    hangUp()
    setCallStartTime(null)
    setCallDuration(0)
    setShowAddToCall(false)
    if ((window as unknown as { callTimer: NodeJS.Timeout }).callTimer) {
      clearInterval((window as unknown as { callTimer: NodeJS.Timeout }).callTimer)
    }
    router.refresh()
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
      console.log('[Calls] Added participant to call:', result)
      setShowAddToCall(false)
    } finally {
      setAddingParticipant(false)
    }
  }

  // Quick dial from contact
  const handleQuickDial = (phone: string) => {
    setPhoneNumber(phone.replace(/\D/g, ''))
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
      default:
        return { text: 'Ready to call', color: 'text-gray-400' }
    }
  }

  const statusInfo = getStatusInfo(status)
  const isInCall = ['connecting', 'ringing', 'connected'].includes(status)

  // Function to add all filtered leads to turbo queue
  const handleAddLeadsToQueue = async (addToQueue: (ids: string[]) => Promise<void>) => {
    const leadIds = filteredLeads.map(l => l.id)
    if (leadIds.length > 0) {
      await addToQueue(leadIds)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            <span className="text-gold-gradient font-semibold">CALLS</span>
          </h1>
          <p className="text-gray-400 mt-1">Make calls and manage your call history</p>
        </div>
        <div className="flex items-center gap-4">
          <TurboModeToggle />
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="glass-card bg-red-500/10 border-red-500/30 text-red-400 px-4 py-3">
          {error}
        </div>
      )}

      {/* Turbo Mode Panel - Active calls for all, queue only for admins */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
        <TurboActiveCallsPanel />
        {isAdmin && <TurboQueuePanel />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dialer */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Dialer</h2>

            {/* Status indicator */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div
                className={`w-2 h-2 rounded-full ${
                  isReady ? 'bg-green-500' : 'bg-yellow-500'
                } ${isReady ? 'animate-pulse' : ''}`}
              />
              <span className={`text-sm ${statusInfo.color}`}>
                {statusInfo.text}
              </span>
            </div>

            {/* Phone number display */}
            <div className="glass-card-subtle rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d+*#]/g, ''))}
                  placeholder="Enter phone number"
                  className="flex-1 bg-transparent text-white text-xl font-mono focus:outline-none placeholder-gray-500"
                  disabled={isInCall}
                />
                {phoneNumber && !isInCall && (
                  <button
                    onClick={handleBackspace}
                    className="p-2 text-gray-400 hover:text-yellow-400 transition-colors"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                )}
              </div>
              {isInCall && (
                <div className={`text-center mt-2 ${statusInfo.color} font-medium`}>
                  {statusInfo.text}
                </div>
              )}
            </div>

            {/* Dial pad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {dialPadKeys.flat().map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="py-4 text-xl font-semibold text-white glass-card-subtle hover:bg-white/10 rounded-xl transition-all active:scale-95"
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Call controls */}
            <div className="flex justify-center gap-4">
              {isInCall ? (
                <>
                  <button
                    onClick={toggleMute}
                    className={`p-4 rounded-full transition-all ${
                      isMuted
                        ? 'bg-red-500/20 border border-red-500/30 hover:bg-red-500/30'
                        : 'glass-card-subtle hover:bg-white/10'
                    }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <MicOff className="w-6 h-6 text-red-400" />
                    ) : (
                      <Mic className="w-6 h-6 text-white" />
                    )}
                  </button>
                  <button
                    onClick={() => setShowAddToCall(true)}
                    disabled={status !== 'connected' || addingParticipant}
                    className="p-4 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    title="Add colleague to call"
                  >
                    {addingParticipant ? (
                      <Loader2 className="w-6 h-6 text-black animate-spin" />
                    ) : (
                      <UserPlus className="w-6 h-6 text-black" />
                    )}
                  </button>
                  <button
                    onClick={handleHangUp}
                    className="p-4 bg-red-500 hover:bg-red-600 rounded-full transition-all hover:scale-105"
                    title="End call"
                  >
                    <PhoneOff className="w-6 h-6 text-white" />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCall}
                  disabled={!isReady || !phoneNumber.trim()}
                  className="p-4 bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 hover:shadow-lg hover:shadow-green-500/25"
                >
                  <Phone className="w-6 h-6 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Leads list */}
        <div className="lg:col-span-1">
          <div className="glass-card h-full flex flex-col">
            <div className="p-5 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white mb-3 uppercase tracking-wide">Quick Dial</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="glass-input w-full pl-10 pr-4"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 max-h-[400px]">
              {filteredLeads.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No leads with phone numbers
                </div>
              ) : (
                filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleQuickDial(lead.phone!)}
                    disabled={isInCall}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left disabled:opacity-50 border-b border-white/5"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm">
                      {lead.first_name?.[0]}
                      {lead.last_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {lead.first_name} {lead.last_name}
                      </p>
                      <p className="text-gray-400 text-sm truncate">{lead.phone}</p>
                    </div>
                    <Phone className="w-4 h-4 text-gray-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent calls */}
        <div className="lg:col-span-1">
          <div className="glass-card h-full flex flex-col">
            <div className="p-5 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Recent Calls</h2>
            </div>

            <div className="overflow-y-auto flex-1 max-h-[400px]">
              {recentCalls.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No recent calls</div>
              ) : (
                recentCalls.map((call) => (
                  <button
                    key={call.id}
                    onClick={() =>
                      handleQuickDial(
                        call.direction === 'outbound' ? call.to_number : call.from_number
                      )
                    }
                    disabled={isInCall}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left disabled:opacity-50 border-b border-white/5"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        call.disposition === 'answered'
                          ? 'bg-green-500/20'
                          : call.disposition === 'no_answer' || call.disposition === 'voicemail'
                          ? 'bg-yellow-500/20'
                          : 'bg-red-500/20'
                      }`}
                    >
                      {call.direction === 'outbound' ? (
                        <PhoneOutgoing
                          className={`w-5 h-5 ${
                            call.disposition === 'answered'
                              ? 'text-green-400'
                              : call.disposition === 'no_answer' || call.disposition === 'voicemail'
                              ? 'text-yellow-400'
                              : 'text-red-400'
                          }`}
                        />
                      ) : (
                        <PhoneIncoming
                          className={`w-5 h-5 ${
                            call.disposition === 'answered'
                              ? 'text-green-400'
                              : call.disposition === 'no_answer' || call.disposition === 'voicemail'
                              ? 'text-yellow-400'
                              : 'text-red-400'
                          }`}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {call.lead && (Array.isArray(call.lead) ? call.lead[0] : call.lead)
                          ? `${(Array.isArray(call.lead) ? call.lead[0] : call.lead).first_name} ${(Array.isArray(call.lead) ? call.lead[0] : call.lead).last_name}`
                          : call.direction === 'outbound'
                          ? call.to_number
                          : call.from_number}
                      </p>
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(call.started_at).toLocaleDateString()}</span>
                        {call.duration_seconds > 0 && (
                          <span>({formatDuration(call.duration_seconds)})</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
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
