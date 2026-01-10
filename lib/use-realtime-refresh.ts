'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseRealtimeRefreshOptions {
  tables: string[]
  userId?: string
  onUpdate?: (table: string, payload: any) => void
}

/**
 * Hook that subscribes to Supabase Realtime changes and refreshes the page
 * when data changes in the specified tables.
 */
export function useRealtimeRefresh({ tables, userId, onUpdate }: UseRealtimeRefreshOptions) {
  const router = useRouter()
  const lastRefresh = useRef<number>(0)
  const isSubscribed = useRef<boolean>(false)

  useEffect(() => {
    if (!userId || tables.length === 0) return

    // Prevent multiple subscriptions
    if (isSubscribed.current) return
    isSubscribed.current = true

    const supabase = createClient()
    const channels: RealtimeChannel[] = []

    // Debounce refresh to avoid rapid re-renders
    const debouncedRefresh = () => {
      const now = Date.now()
      // Only refresh if at least 1 second has passed since last refresh
      if (now - lastRefresh.current > 1000) {
        lastRefresh.current = now
        router.refresh()
      }
    }

    // Subscribe to each table
    tables.forEach((table) => {
      const channel = supabase
        .channel(`realtime-${table}-${userId}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table,
          },
          (payload) => {
            console.log(`[Realtime] ${table} changed:`, payload.eventType)

            // Call custom handler if provided
            if (onUpdate) {
              onUpdate(table, payload)
            }

            // Debounced refresh to avoid rapid updates
            debouncedRefresh()
          }
        )
        .subscribe((status) => {
          console.log(`[Realtime] ${table} subscription:`, status)
        })

      channels.push(channel)
    })

    return () => {
      isSubscribed.current = false
      channels.forEach((channel) => {
        supabase.removeChannel(channel)
      })
    }
  }, [userId, tables.join(','), router, onUpdate])
}
