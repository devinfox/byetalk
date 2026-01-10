'use client'

import { MessageCircle } from 'lucide-react'
import { useChat } from '@/lib/chat-context'

export function ChatButton() {
  const { openChat, totalUnreadCount } = useChat()

  return (
    <button
      onClick={() => openChat()}
      className="fixed bottom-4 right-20 z-40 p-3.5 rounded-full glass-button-gold shadow-lg hover:scale-110 transition-all duration-200 glow-gold-subtle"
      title="Team Chat"
    >
      <MessageCircle className="w-6 h-6 text-yellow-400" />
      {totalUnreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
          {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
        </span>
      )}
    </button>
  )
}
