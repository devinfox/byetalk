'use client'

import type { Message } from '@/types/database.types'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] px-4 py-2 rounded-2xl ${
          isOwn
            ? 'bg-yellow-500/20 border border-yellow-500/30 text-white'
            : 'bg-white/5 border border-white/10 text-white'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`text-xs mt-1 ${isOwn ? 'text-yellow-400/60' : 'text-gray-500'}`}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  )
}
