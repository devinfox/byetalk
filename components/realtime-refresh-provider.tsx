'use client'

import { ReactNode } from 'react'
import { useRealtimeRefresh } from '@/lib/use-realtime-refresh'

interface RealtimeRefreshProviderProps {
  children: ReactNode
  userId?: string
}

// Tables to watch for real-time updates
const WATCHED_TABLES = [
  'tasks',
  'email_drafts',
  'calls',
  'leads',
  'emails',
]

export function RealtimeRefreshProvider({ children, userId }: RealtimeRefreshProviderProps) {
  useRealtimeRefresh({
    tables: WATCHED_TABLES,
    userId,
    onUpdate: (table, payload) => {
      console.log(`[RealtimeRefresh] ${table} updated:`, payload.eventType)
    },
  })

  return <>{children}</>
}
