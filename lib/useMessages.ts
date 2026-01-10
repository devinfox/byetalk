'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Message } from '@/types/database.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseMessagesOptions {
  currentUserId: string
  partnerId: string
}

interface UseMessagesReturn {
  messages: Message[]
  loading: boolean
  error: string | null
  sendMessage: (content: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useMessages({ currentUserId, partnerId }: UseMessagesOptions): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch conversation history
  const fetchMessages = useCallback(async () => {
    if (!currentUserId || !partnerId) return

    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${currentUserId})`
      )
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.error('Failed to fetch messages:', fetchError)
      setError('Failed to load messages')
      setLoading(false)
      return
    }

    setMessages(data || [])
    setLoading(false)
  }, [currentUserId, partnerId])

  // Subscribe to new messages in this conversation
  useEffect(() => {
    if (!currentUserId || !partnerId) return

    const supabase = createClient()
    let channel: RealtimeChannel | null = null

    // Initial fetch
    fetchMessages()

    // Create a unique channel name for this conversation
    const channelName = `chat-${[currentUserId, partnerId].sort().join('-')}`

    channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMessage = payload.new as Message
          // Only add if it's part of this conversation
          const isRelevant =
            (newMessage.sender_id === currentUserId && newMessage.recipient_id === partnerId) ||
            (newMessage.sender_id === partnerId && newMessage.recipient_id === currentUserId)

          if (isRelevant) {
            setMessages((prev) => {
              // Avoid duplicates (in case of optimistic update)
              if (prev.some((m) => m.id === newMessage.id)) {
                return prev
              }
              return [...prev, newMessage]
            })
          }
        }
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentUserId, partnerId, fetchMessages])

  // Send a new message
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!content.trim() || !currentUserId || !partnerId) return false

      const supabase = createClient()

      // Optimistic update
      const tempId = `temp-${Date.now()}`
      const tempMessage: Message = {
        id: tempId,
        sender_id: currentUserId,
        recipient_id: partnerId,
        content: content.trim(),
        is_read: false,
        read_at: null,
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, tempMessage])

      const { data, error: sendError } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUserId,
          recipient_id: partnerId,
          content: content.trim(),
        })
        .select()
        .single()

      if (sendError) {
        console.error('Failed to send message:', sendError)
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setError('Failed to send message')
        return false
      }

      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? data : m))
      )

      return true
    },
    [currentUserId, partnerId]
  )

  return {
    messages,
    loading,
    error,
    sendMessage,
    refetch: fetchMessages,
  }
}
