'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { useChat } from '@/lib/chat-context'

interface ChatUser {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  is_active: boolean
}

interface ContactListProps {
  users: ChatUser[]
}

export function ContactList({ users }: ContactListProps) {
  const { selectedUserId, selectUser, unreadCounts } = useChat()
  const [search, setSearch] = useState('')

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase()
    return fullName.includes(search.toLowerCase())
  })

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 glass-input text-sm"
          />
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {search ? 'No users found' : 'No team members'}
          </div>
        ) : (
          filteredUsers.map((user) => {
            const unreadCount = unreadCounts[user.id] || 0
            const isSelected = selectedUserId === user.id

            return (
              <button
                key={user.id}
                onClick={() => selectUser(user.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${
                  isSelected ? 'bg-yellow-500/10 border-l-2 border-yellow-400' : 'border-l-2 border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm">
                    {user.first_name?.[0]}
                    {user.last_name?.[0]}
                  </div>
                  {user.is_active && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                  )}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-yellow-400' : 'text-white'}`}>
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user.is_active ? 'Online' : 'Offline'}
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
