'use client'

import { ReactNode, useEffect, useState } from 'react'
import { ChatProvider } from '@/lib/chat-context'
import { ChatButton } from './chat-button'
import { ChatModal } from './chat-modal'
import { createClient } from '@/lib/supabase'

interface ChatUser {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  is_active: boolean
}

interface ChatWrapperProps {
  children: ReactNode
  userId?: string
}

export function ChatWrapper({ children, userId }: ChatWrapperProps) {
  const [users, setUsers] = useState<ChatUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsers = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, is_active')
        .eq('is_deleted', false)
        .order('first_name')

      if (error) {
        console.error('Failed to fetch users for chat:', error)
      } else {
        setUsers(data || [])
      }
      setLoading(false)
    }

    if (userId) {
      fetchUsers()
    }
  }, [userId])

  // Don't render chat if no user or still loading
  if (!userId || loading) {
    return <>{children}</>
  }

  return (
    <ChatProvider currentUserId={userId}>
      {children}
      <ChatButton />
      <ChatModal currentUserId={userId} users={users} />
    </ChatProvider>
  )
}
