'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { X, User, Phone } from 'lucide-react'

interface TurboSession {
  id: string
  user_id: string
  status: 'active' | 'paused' | 'ended'
  started_at: string
  calls_made: number
  calls_connected: number
  conference_name?: string
  twiml_url?: string
  users?: {
    first_name: string
    last_name: string
  }
}

interface TurboStartResult {
  success: boolean
  session_id?: string
  conference_name?: string
  twiml_url?: string
  error?: string
}

interface TurboQueueItem {
  id: string
  lead_id: string
  priority: number
  status: string
  leads?: {
    id: string
    first_name: string
    last_name: string
    phone: string
  }
}

interface TurboActiveCall {
  id: string
  call_sid: string
  lead_id: string
  lead_phone: string
  lead_name: string
  status: string
  assigned_to: string | null
  dialed_at: string
  answered_at: string | null
  connected_at: string | null
}

interface CallJoinNotification {
  id: string
  leadName: string
  leadPhone: string
  timestamp: Date
}

// Play notification sound for call join
function playJoinSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Pleasant ascending tone for someone joining
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime) // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1) // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2) // G5
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.4)
  } catch (e) {
    console.log('Could not play join sound:', e)
  }
}

interface TurboModeContextType {
  // State
  isInTurboMode: boolean
  session: TurboSession | null
  queueItems: TurboQueueItem[]
  queueCount: number
  activeCalls: TurboActiveCall[]
  activeSessions: TurboSession[]
  isLoading: boolean
  error: string | null
  twimlUrl: string | null

  // Actions
  startTurboMode: () => Promise<TurboStartResult>
  stopTurboMode: () => Promise<void>
  addToQueue: (leadIds: string[]) => Promise<void>
  removeFromQueue: (leadId: string) => Promise<void>
  clearQueue: () => Promise<void>
  dialNextBatch: () => Promise<void>
  refreshStatus: () => Promise<void>
}

const TurboModeContext = createContext<TurboModeContextType | undefined>(undefined)

export function TurboModeProvider({ children }: { children: React.ReactNode }) {
  const [isInTurboMode, setIsInTurboMode] = useState(false)
  const [session, setSession] = useState<TurboSession | null>(null)
  const [queueItems, setQueueItems] = useState<TurboQueueItem[]>([])
  const [queueCount, setQueueCount] = useState(0)
  const [activeCalls, setActiveCalls] = useState<TurboActiveCall[]>([])
  const [activeSessions, setActiveSessions] = useState<TurboSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [twimlUrl, setTwimlUrl] = useState<string | null>(null)
  const [callJoinNotifications, setCallJoinNotifications] = useState<CallJoinNotification[]>([])

  const supabase = createClient()
  const dialIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const connectedCallIdsRef = useRef<Set<string>>(new Set())

  // Fetch current status
  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/turbo/queue')
      if (!response.ok) throw new Error('Failed to fetch status')

      const data = await response.json()

      console.log('[TurboMode] refreshStatus() received:', {
        queueTotal: data.queue?.total,
        queueItemsCount: data.queue?.items?.length,
        activeCallsCount: data.active_calls?.length,
        activeSessionsCount: data.sessions?.active?.length,
        mySessionId: data.sessions?.my_session?.id?.slice(0, 8),
        mySessionStatus: data.sessions?.my_session?.status,
      })

      setQueueItems(data.queue.items || [])
      setQueueCount(data.queue.total || 0)
      setActiveCalls(data.active_calls || [])
      setActiveSessions(data.sessions.active || [])

      if (data.sessions.my_session) {
        setSession(data.sessions.my_session)
        setIsInTurboMode(data.sessions.my_session.status === 'active')
      } else {
        setSession(null)
        setIsInTurboMode(false)
      }
    } catch (err) {
      console.error('[TurboMode] Error fetching status:', err)
    }
  }, [])

  // Start turbo mode
  const startTurboMode = useCallback(async (): Promise<TurboStartResult> => {
    console.log('[TurboMode] startTurboMode() called')
    setIsLoading(true)
    setError(null)

    try {
      console.log('[TurboMode] Making POST request to /api/turbo/session/start...')
      const response = await fetch('/api/turbo/session/start', { method: 'POST' })
      const data = await response.json()

      console.log('[TurboMode] Session start response:', {
        status: response.status,
        ok: response.ok,
        session_id: data.session_id,
        conference_name: data.conference_name,
        twiml_url: data.twiml_url,
        error: data.error,
      })

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start turbo mode')
      }

      console.log('[TurboMode] Setting isInTurboMode to true')
      setIsInTurboMode(true)
      setTwimlUrl(data.twiml_url || null)

      console.log('[TurboMode] Calling refreshStatus() after session start...')
      await refreshStatus()
      console.log('[TurboMode] refreshStatus() completed')

      // Note: Auto-dialing now starts after rep connects to conference
      // The caller should connect to the twiml_url, then dialing will begin

      return {
        success: true,
        session_id: data.session_id,
        conference_name: data.conference_name,
        twiml_url: data.twiml_url,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start'
      setError(errorMsg)
      console.error('[TurboMode] Error starting:', err)
      return { success: false, error: errorMsg }
    } finally {
      setIsLoading(false)
    }
  }, [refreshStatus])

  // Stop turbo mode
  const stopTurboMode = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/turbo/session/stop', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop turbo mode')
      }

      setIsInTurboMode(false)
      setSession(null)
      setTwimlUrl(null)

      // Clear dial interval
      if (dialIntervalRef.current) {
        clearInterval(dialIntervalRef.current)
        dialIntervalRef.current = null
      }

      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop')
      console.error('[TurboMode] Error stopping:', err)
    } finally {
      setIsLoading(false)
    }
  }, [refreshStatus])

  // Add leads to queue
  const addToQueue = useCallback(async (leadIds: string[]) => {
    setError(null)

    try {
      const response = await fetch('/api/turbo/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: leadIds }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add to queue')
      }

      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add')
      console.error('[TurboMode] Error adding to queue:', err)
    }
  }, [refreshStatus])

  // Remove lead from queue
  const removeFromQueue = useCallback(async (leadId: string) => {
    try {
      await fetch(`/api/turbo/queue?lead_id=${leadId}`, { method: 'DELETE' })
      await refreshStatus()
    } catch (err) {
      console.error('[TurboMode] Error removing from queue:', err)
    }
  }, [refreshStatus])

  // Clear entire queue
  const clearQueue = useCallback(async () => {
    try {
      await fetch('/api/turbo/queue?clear_all=true', { method: 'DELETE' })
      await refreshStatus()
    } catch (err) {
      console.error('[TurboMode] Error clearing queue:', err)
    }
  }, [refreshStatus])

  // Dial next batch of leads
  // Note: We removed the isInTurboMode check here because it causes stale closure issues
  // when called from setTimeout. The API will validate the session anyway.
  const dialNextBatch = useCallback(async () => {
    console.log('[TurboMode] dialNextBatch() called at', new Date().toISOString())
    try {
      console.log('[TurboMode] Making POST request to /api/turbo/dial...')
      const response = await fetch('/api/turbo/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads_per_rep: 3 }),
      })

      console.log('[TurboMode] Dial API response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TurboMode] Dial API error response:', errorText)
        return
      }

      const data = await response.json()
      console.log('[TurboMode] Dial API response data:', JSON.stringify(data, null, 2))

      if (data.calls_initiated > 0) {
        console.log(`[TurboMode] SUCCESS: Initiated ${data.calls_initiated} calls, batch_id: ${data.batch_id}`)
      } else {
        console.log(`[TurboMode] No calls initiated. Reason: ${data.message || 'unknown'}`)
        if (data.debug) {
          console.log('[TurboMode] Debug info:', JSON.stringify(data.debug, null, 2))
        }
      }

      await refreshStatus()
    } catch (err) {
      console.error('[TurboMode] Error in dialNextBatch:', err)
      if (err instanceof Error) {
        console.error('[TurboMode] Error name:', err.name)
        console.error('[TurboMode] Error message:', err.message)
        console.error('[TurboMode] Error stack:', err.stack)
      }
    }
  }, [refreshStatus])

  // Setup realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('turbo-mode-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'turbo_active_calls',
        },
        () => {
          refreshStatus()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'turbo_mode_sessions',
        },
        () => {
          refreshStatus()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'turbo_call_queue',
        },
        () => {
          refreshStatus()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, refreshStatus])

  // Auto-dial when in turbo mode and calls complete
  useEffect(() => {
    console.log('[TurboMode] Auto-dial effect triggered. State:', {
      isInTurboMode,
      activeCallsCount: activeCalls.length,
      activeCallStatuses: activeCalls.map(c => ({ id: c.id?.slice(0, 8), status: c.status })),
      queueCount,
    })

    if (isInTurboMode) {
      // Check every 5 seconds if we need to dial more
      statusIntervalRef.current = setInterval(() => {
        refreshStatus()
      }, 5000)

      // Dial when active calls drop below 3
      const activeCount = activeCalls.filter(c =>
        ['dialing', 'ringing', 'answered', 'connected'].includes(c.status)
      ).length

      console.log(`[TurboMode] Active call count: ${activeCount}, Queue count: ${queueCount}`)

      if (activeCount < 3 && queueCount > 0) {
        console.log('[TurboMode] Conditions met (activeCount < 3 && queueCount > 0), calling dialNextBatch()')
        dialNextBatch()
      } else {
        console.log(`[TurboMode] NOT dialing. Reason: ${activeCount >= 3 ? 'Already have 3+ active calls' : 'Queue is empty'}`)
      }
    } else {
      console.log('[TurboMode] Not in turbo mode, skipping auto-dial')
    }

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
    }
  }, [isInTurboMode, activeCalls, queueCount, dialNextBatch, refreshStatus])

  // Initial fetch
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  // Track when calls become connected and show notifications
  useEffect(() => {
    if (!isInTurboMode) {
      // Clear tracked IDs when not in turbo mode
      connectedCallIdsRef.current.clear()
      return
    }

    // Find newly connected calls
    const connectedCalls = activeCalls.filter(call => call.status === 'connected')

    connectedCalls.forEach(call => {
      // Only notify for calls we haven't seen as connected before
      if (!connectedCallIdsRef.current.has(call.id)) {
        connectedCallIdsRef.current.add(call.id)

        // Play sound and show notification
        playJoinSound()

        const notificationId = `join-${call.id}-${Date.now()}`
        setCallJoinNotifications(prev => [
          ...prev,
          {
            id: notificationId,
            leadName: call.lead_name || 'Unknown',
            leadPhone: call.lead_phone,
            timestamp: new Date(),
          },
        ])

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setCallJoinNotifications(prev => prev.filter(n => n.id !== notificationId))
        }, 5000)
      }
    })

    // Clean up tracked IDs for calls that are no longer active
    const activeCallIds = new Set(activeCalls.map(c => c.id))
    connectedCallIdsRef.current.forEach(id => {
      if (!activeCallIds.has(id)) {
        connectedCallIdsRef.current.delete(id)
      }
    })
  }, [activeCalls, isInTurboMode])

  // Dismiss notification manually
  const dismissJoinNotification = useCallback((id: string) => {
    setCallJoinNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const value: TurboModeContextType = {
    isInTurboMode,
    session,
    queueItems,
    queueCount,
    activeCalls,
    activeSessions,
    isLoading,
    error,
    twimlUrl,
    startTurboMode,
    stopTurboMode,
    addToQueue,
    removeFromQueue,
    clearQueue,
    dialNextBatch,
    refreshStatus,
  }

  return (
    <TurboModeContext.Provider value={value}>
      {children}

      {/* Call Join Notifications - Right side */}
      {callJoinNotifications.length > 0 && (
        <div className="fixed top-20 right-4 z-[100] space-y-2 max-w-sm">
          {callJoinNotifications.map((notification) => (
            <div
              key={notification.id}
              className="flex items-center gap-3 p-4 bg-gray-900/95 backdrop-blur-sm border border-green-500/30 rounded-xl shadow-2xl animate-slide-in-right"
            >
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">Joined the call</span>
                </div>
                <p className="text-white font-semibold text-lg truncate">{notification.leadName}</p>
                <p className="text-sm text-gray-400">{notification.leadPhone}</p>
              </div>
              <button
                onClick={() => dismissJoinNotification(notification.id)}
                className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </TurboModeContext.Provider>
  )
}

export function useTurboMode() {
  const context = useContext(TurboModeContext)
  if (context === undefined) {
    throw new Error('useTurboMode must be used within a TurboModeProvider')
  }
  return context
}
