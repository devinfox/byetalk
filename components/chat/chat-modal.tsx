'use client'

import { useState } from 'react'
import { X, ArrowLeft, Search } from 'lucide-react'
import { useChat } from '@/lib/chat-context'
import { ChatView } from './chat-view'

interface ChatUser {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  is_active: boolean
}

interface ChatModalProps {
  currentUserId: string
  users: ChatUser[]
}

export function ChatModal({ currentUserId, users }: ChatModalProps) {
  const { isOpen, closeChat, selectedUserId, selectUser, unreadCounts } = useChat()
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  // Filter out current user from the list
  const otherUsers = users.filter((u) => u.id !== currentUserId)

  // Find selected user info
  const selectedUser = otherUsers.find((u) => u.id === selectedUserId)

  // Filter users by search
  const filteredUsers = otherUsers.filter((user) => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase()
    return fullName.includes(search.toLowerCase())
  })

  // If a user is selected, show the chat view
  if (selectedUserId && selectedUser) {
    return (
      <div className="fixed bottom-20 right-4 z-50 w-80 h-[480px] bg-gray-900 border border-gray-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header with back button */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-gray-800">
          <button
            onClick={() => selectUser(null)}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-xs">
                {selectedUser.first_name?.[0]}{selectedUser.last_name?.[0]}
              </div>
              {selectedUser.is_active && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-gray-800" />
              )}
            </div>
            <span className="text-sm font-medium text-white truncate">
              {selectedUser.first_name} {selectedUser.last_name}
            </span>
          </div>
          <button
            onClick={closeChat}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat View (without its own header) */}
        <div className="flex-1 min-h-0">
          <ChatViewCompact
            currentUserId={currentUserId}
            partnerId={selectedUserId}
          />
        </div>
      </div>
    )
  }

  // Contact list view
  return (
    <div className="fixed bottom-20 right-4 z-50 w-80 bg-gray-900 border border-gray-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h2 className="text-sm font-semibold text-white">New message</h2>
        <button
          onClick={closeChat}
          className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
            autoFocus
          />
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto max-h-80">
        {filteredUsers.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {search ? 'No users found' : 'No team members'}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const unreadCount = unreadCounts[user.id] || 0

            return (
              <button
                key={user.id}
                onClick={() => selectUser(user.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                  {user.is_active && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900/80" />
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user.first_name} {user.last_name}
                  </p>
                </div>

                {/* Unread Badge */}
                {unreadCount > 0 && (
                  <span className="flex-shrink-0 min-w-5 h-5 px-1.5 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// Compact chat view without header (used inside the modal)
import { useState as useStateCompact, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useMessages } from '@/lib/useMessages'
import { MessageBubble } from './message-bubble'

function ChatViewCompact({ currentUserId, partnerId }: { currentUserId: string; partnerId: string }) {
  const [input, setInput] = useStateCompact('')
  const [sending, setSending] = useStateCompact(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { markAsRead } = useChat()

  const { messages, loading, sendMessage } = useMessages({
    currentUserId,
    partnerId,
  })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark messages as read when viewing this conversation
  useEffect(() => {
    if (partnerId && messages.length > 0) {
      markAsRead(partnerId)
    }
  }, [partnerId, messages.length, markAsRead])

  const handleSend = async () => {
    if (!input.trim() || sending) return

    setSending(true)
    const success = await sendMessage(input.trim())
    if (success) {
      setInput('')
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm text-center">
              No messages yet
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.sender_id === currentUserId}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700 bg-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500/50"
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-3 py-2 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg disabled:opacity-50 hover:bg-yellow-500/30 transition-all"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
