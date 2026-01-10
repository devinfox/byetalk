'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { X, CheckCircle2 } from 'lucide-react'
import { useNimbus } from '@/components/nimbus'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Module-level Set to persist across component remounts (HMR, navigation, etc.)
const globalProcessedMessageIds = new Set<string>()
// Track messages currently being processed (to prevent parallel API calls)
const globalProcessingMessageIds = new Set<string>()

// Trigger phrases that indicate a potential request
const REQUEST_TRIGGERS = [
  'can you',
  'could you',
  'will you',
  'would you',
  'please',
  'would you mind',
  'i need you to',
  'make sure to',
  'don\'t forget to',
  'remember to',
  'need you to',
]

interface TaskNotification {
  id: string
  senderName: string
  taskTitle: string
}

interface ChatContextType {
  isOpen: boolean
  selectedUserId: string | null
  unreadCounts: Record<string, number>
  totalUnreadCount: number
  openChat: (userId?: string) => void
  closeChat: () => void
  selectUser: (userId: string | null) => void
  markAsRead: (senderId: string) => Promise<void>
  refreshUnreadCounts: () => Promise<void>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

interface ChatProviderProps {
  children: ReactNode
  currentUserId: string
  users?: Array<{ id: string; first_name: string; last_name: string }>
}

export function ChatProvider({ children, currentUserId }: ChatProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [taskNotifications, setTaskNotifications] = useState<TaskNotification[]>([])
  const processedMessageIds = useRef<Set<string>>(new Set())
  const usersCache = useRef<Record<string, { first_name: string; last_name: string }>>({})
  const { showNimbus } = useNimbus()

  const totalUnreadCount = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0)

  // Check if message contains request trigger phrases
  const containsRequestTrigger = useCallback((content: string): boolean => {
    const lowerContent = content.toLowerCase()
    return REQUEST_TRIGGERS.some((trigger) => lowerContent.includes(trigger))
  }, [])

  // Get user name from cache or fetch
  const getUserName = useCallback(async (userId: string): Promise<string> => {
    if (usersCache.current[userId]) {
      const user = usersCache.current[userId]
      return `${user.first_name} ${user.last_name}`
    }

    const supabase = createClient()
    const { data } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', userId)
      .single()

    if (data) {
      usersCache.current[userId] = data
      return `${data.first_name} ${data.last_name}`
    }

    return 'Colleague'
  }, [])

  // Analyze message and create task if actionable
  const analyzeMessageForTask = useCallback(async (
    messageId: string,
    content: string,
    senderId: string
  ) => {
    console.log('[Chat Task] Checking message:', { messageId, content, senderId })

    // Don't process the same message twice (use both local ref and global Set)
    if (processedMessageIds.current.has(messageId) || globalProcessedMessageIds.has(messageId)) {
      console.log('[Chat Task] Already processed, skipping')
      return
    }

    // Check if already being processed (parallel call prevention)
    if (globalProcessingMessageIds.has(messageId)) {
      console.log('[Chat Task] Already processing, skipping')
      return
    }

    // Only process if contains trigger phrase
    if (!containsRequestTrigger(content)) {
      console.log('[Chat Task] No trigger phrase found, skipping')
      return
    }

    // Lock this message for processing
    globalProcessingMessageIds.add(messageId)
    console.log('[Chat Task] Locked message for processing:', messageId)

    // Mark as processed immediately to prevent any other calls
    processedMessageIds.current.add(messageId)
    globalProcessedMessageIds.add(messageId)

    console.log('[Chat Task] Trigger phrase found, analyzing...')
    const senderName = await getUserName(senderId)

    try {
      const response = await fetch('/api/chat/analyze-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          message: content,
          senderName,
          senderId,
          recipientId: currentUserId,
        }),
      })

      const result = await response.json()
      console.log('[Chat Task] API response:', result)

      // Handle email draft creation - trigger Nimbus
      if (result.emailDraftCreated) {
        console.log('[Chat Task] Email draft created, triggering Nimbus')

        // Get current user's first name
        const supabase = createClient()
        const { data: currentUserProfile } = await supabase
          .from('users')
          .select('first_name')
          .eq('id', currentUserId)
          .single()

        const userName = currentUserProfile?.first_name || 'there'
        const attachments = result.attachedDocuments?.length > 0
          ? result.attachedDocuments.join(', ')
          : null

        let message = `I went ahead and drafted an email to ${senderName}`
        if (attachments) {
          message += ` with the ${attachments} attached`
        }
        message += '!'

        showNimbus({
          mood: 'happy',
          title: `Hey ${userName}!`,
          message,
          subMessage: 'Review and send it over when you get a chance.',
          actionLabel: 'Review Draft',
          onAction: () => {
            // Navigate directly to compose with the draft
            if (result.draftId) {
              window.location.href = `/dashboard/email/compose?draftId=${result.draftId}`
            } else {
              window.location.href = '/dashboard/email/ai-drafts'
            }
          },
          dismissLabel: 'Later',
        })
      }
      // Handle task creation
      else if (result.taskCreated && result.taskTitle) {
        // Show notification
        const notificationId = Math.random().toString(36).substring(2, 9)
        setTaskNotifications((prev) => [
          ...prev,
          {
            id: notificationId,
            senderName,
            taskTitle: result.taskTitle,
          },
        ])

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setTaskNotifications((prev) => prev.filter((n) => n.id !== notificationId))
        }, 5000)
      }
    } catch (error) {
      console.error('[Chat Task] Failed to analyze message:', error)
    } finally {
      // Release the processing lock
      globalProcessingMessageIds.delete(messageId)
      console.log('[Chat Task] Released lock for message:', messageId)
    }
  }, [currentUserId, containsRequestTrigger, getUserName, showNimbus])

  const dismissTaskNotification = useCallback((id: string) => {
    setTaskNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  // Fetch unread counts from database
  const refreshUnreadCounts = useCallback(async () => {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('recipient_id', currentUserId)
      .eq('is_read', false)
      .eq('is_deleted', false)

    if (error) {
      console.error('Failed to fetch unread counts:', error)
      return
    }

    // Count messages per sender
    const counts: Record<string, number> = {}
    data?.forEach((msg) => {
      counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1
    })
    setUnreadCounts(counts)
  }, [currentUserId])

  // Subscribe to new messages for real-time unread updates
  useEffect(() => {
    if (!currentUserId) return

    const supabase = createClient()
    let channel: RealtimeChannel | null = null

    // Initial fetch
    refreshUnreadCounts()

    // Subscribe to new messages where current user is recipient
    channel = supabase
      .channel(`chat-unread-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload) => {
          console.log('[Chat] New message received:', payload.new)
          const newMessage = payload.new as { id: string; sender_id: string; content: string; created_at?: string }
          // Update unread count for this sender
          setUnreadCounts((prev) => ({
            ...prev,
            [newMessage.sender_id]: (prev[newMessage.sender_id] || 0) + 1,
          }))

          // Only analyze truly recent messages (within last 10 seconds)
          // This prevents re-processing old messages on page refresh/reconnect
          const messageAge = newMessage.created_at
            ? Date.now() - new Date(newMessage.created_at).getTime()
            : Infinity // If no timestamp, assume it's old
          const isRecentMessage = messageAge >= 0 && messageAge < 10000 // 10 seconds

          // Analyze message for potential task request
          if (newMessage.content && newMessage.sender_id !== currentUserId && isRecentMessage) {
            console.log('[Chat] Triggering task analysis for recent message:', newMessage.id, `(${Math.round(messageAge / 1000)}s old)`)
            analyzeMessageForTask(newMessage.id, newMessage.content, newMessage.sender_id)
          } else if (!isRecentMessage && newMessage.content) {
            console.log('[Chat] Skipping analysis for old message:', newMessage.id, `(${Math.round(messageAge / 1000)}s old)`)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        () => {
          // Refresh counts when messages are marked as read
          refreshUnreadCounts()
        }
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentUserId, refreshUnreadCounts, analyzeMessageForTask])

  const openChat = useCallback((userId?: string) => {
    if (userId) {
      setSelectedUserId(userId)
    }
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  const selectUser = useCallback((userId: string | null) => {
    setSelectedUserId(userId)
  }, [])

  const markAsRead = useCallback(async (senderId: string) => {
    const supabase = createClient()

    const { error } = await supabase
      .from('messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('sender_id', senderId)
      .eq('recipient_id', currentUserId)
      .eq('is_read', false)

    if (error) {
      console.error('Failed to mark messages as read:', error)
      return
    }

    // Update local state
    setUnreadCounts((prev) => {
      const newCounts = { ...prev }
      delete newCounts[senderId]
      return newCounts
    })
  }, [currentUserId])

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        selectedUserId,
        unreadCounts,
        totalUnreadCount,
        openChat,
        closeChat,
        selectUser,
        markAsRead,
        refreshUnreadCounts,
      }}
    >
      {children}

      {/* Task Creation Notifications */}
      {taskNotifications.length > 0 && (
        <div className="fixed bottom-24 left-4 z-[100] space-y-2 max-w-sm">
          {taskNotifications.map((notification) => (
            <div
              key={notification.id}
              className="flex items-start gap-3 p-4 bg-gray-900 border border-green-500/30 rounded-xl shadow-2xl animate-slide-in-left"
            >
              <div className="flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                  Added <span className="font-medium text-yellow-400">{notification.senderName}&apos;s</span> request to your tasks
                </p>
                <p className="text-xs text-gray-400 mt-1 truncate">{notification.taskTitle}</p>
              </div>
              <button
                onClick={() => dismissTaskNotification(notification.id)}
                className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-in-left {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.3s ease-out;
        }
      `}</style>
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
