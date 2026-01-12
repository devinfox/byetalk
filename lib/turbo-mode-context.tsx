'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

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

  const supabase = createClient()
  const dialIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const statusIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch current status
  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/turbo/queue')
      if (!response.ok) throw new Error('Failed to fetch status')

      const data = await response.json()

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
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/turbo/session/start', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start turbo mode')
      }

      setIsInTurboMode(true)
      setTwimlUrl(data.twiml_url || null)
      await refreshStatus()

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
  const dialNextBatch = useCallback(async () => {
    if (!isInTurboMode) return

    try {
      const response = await fetch('/api/turbo/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_size: 3 }),
      })

      const data = await response.json()

      if (data.calls_initiated > 0) {
        console.log(`[TurboMode] Initiated ${data.calls_initiated} calls`)
      }

      await refreshStatus()
    } catch (err) {
      console.error('[TurboMode] Error dialing:', err)
    }
  }, [isInTurboMode, refreshStatus])

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
    if (isInTurboMode) {
      // Check every 5 seconds if we need to dial more
      statusIntervalRef.current = setInterval(() => {
        refreshStatus()
      }, 5000)

      // Dial when active calls drop below 3
      const activeCount = activeCalls.filter(c =>
        ['dialing', 'ringing', 'answered', 'connected'].includes(c.status)
      ).length

      if (activeCount < 3 && queueCount > 0) {
        dialNextBatch()
      }
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
