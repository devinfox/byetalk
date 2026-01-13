'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Search,
  Plus,
  Hash,
  Users,
  MessageCircle,
  Send,
  Loader2,
  X,
  Settings,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface User {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  is_active: boolean
}

interface Message {
  id: string
  sender_id: string
  recipient_id?: string
  content: string
  created_at: string
  sender?: User
}

interface GroupMessage {
  id: string
  group_id: string
  sender_id: string
  content: string
  created_at: string
}

interface MessageGroup {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  member_count?: number
}

interface Conversation {
  type: 'dm' | 'group'
  id: string
  name: string
  avatar?: string | null
  lastMessage?: string
  lastMessageTime?: string
  unreadCount: number
  isOnline?: boolean
  user?: User
  group?: MessageGroup
}

// Play notification sound
function playPingSound() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Pleasant ping sound
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime) // A5 note
    oscillator.frequency.setValueAtTime(1318.5, audioContext.currentTime + 0.1) // E6 note
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  } catch (e) {
    console.log('Could not play notification sound:', e)
  }
}

export default function ByeMessagePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<MessageGroup[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<(Message | GroupMessage)[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [showDMsExpanded, setShowDMsExpanded] = useState(true)
  const [showGroupsExpanded, setShowGroupsExpanded] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Fetch current user and colleagues
  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return

      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, is_active, organization_id')
        .eq('auth_id', authUser.id)
        .single()

      if (!userData) return
      setCurrentUser(userData)

      // Get colleagues
      const { data: colleagues } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url, is_active, email')
        .eq('organization_id', userData.organization_id)
        .eq('is_deleted', false)
        .neq('id', userData.id)
        .order('first_name')

      // Filter out hidden users:
      // 1. Specific UID that should be hidden
      // 2. Devin Fox
      // 3. Any Shaun Bina except the one with admin@ email
      const hiddenUserIds = ['ac3512eb-286e-4b5c-b95d-17bddbd142d4']
      const filteredColleagues = (colleagues || []).filter(user => {
        // Hide specific user ID
        if (hiddenUserIds.includes(user.id)) return false
        // Hide Devin Fox
        if (user.first_name?.toLowerCase() === 'devin' && user.last_name?.toLowerCase() === 'fox') return false
        // For Shaun Bina, only show if email starts with admin@
        if (user.first_name?.toLowerCase() === 'shaun' && user.last_name?.toLowerCase() === 'bina') {
          return user.email?.toLowerCase().startsWith('admin@')
        }
        return true
      })

      setUsers(filteredColleagues)

      // Get groups user belongs to
      const { data: memberOf } = await supabase
        .from('message_group_members')
        .select('group_id')
        .eq('user_id', userData.id)

      if (memberOf && memberOf.length > 0) {
        const groupIds = memberOf.map(m => m.group_id)
        const { data: groupsData } = await supabase
          .from('message_groups')
          .select('id, name, description, created_by, created_at')
          .in('id', groupIds)
          .eq('is_deleted', false)

        setGroups(groupsData || [])
      }

      // Build conversations list
      buildConversationsList(userData.id, colleagues || [], [])

      setLoading(false)
    }

    fetchData()
  }, [])

  // Build conversations list from DMs and groups
  const buildConversationsList = useCallback(
    (userId: string, colleagues: User[], groupsList: MessageGroup[]) => {
      const convos: Conversation[] = []

      // Add DMs
      colleagues.forEach(user => {
        convos.push({
          type: 'dm',
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          avatar: user.avatar_url,
          unreadCount: 0,
          isOnline: user.is_active,
          user,
        })
      })

      // Add groups
      groupsList.forEach(group => {
        convos.push({
          type: 'group',
          id: group.id,
          name: group.name,
          unreadCount: 0,
          group,
        })
      })

      setConversations(convos)
    },
    []
  )

  // Update conversations when groups change
  useEffect(() => {
    if (currentUser && users.length > 0) {
      buildConversationsList(currentUser.id, users, groups)
    }
  }, [currentUser, users, groups, buildConversationsList])

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!selectedConversation || !currentUser) return

    const convo = selectedConversation
    const user = currentUser

    async function fetchMessages() {
      setMessagesLoading(true)

      if (convo.type === 'dm') {
        const { data } = await supabase
          .from('messages')
          .select('id, sender_id, recipient_id, content, created_at')
          .or(
            `and(sender_id.eq.${user.id},recipient_id.eq.${convo.id}),and(sender_id.eq.${convo.id},recipient_id.eq.${user.id})`
          )
          .eq('is_deleted', false)
          .order('created_at', { ascending: true })
          .limit(100)

        setMessages(data || [])
      } else {
        const { data } = await supabase
          .from('group_messages')
          .select('id, group_id, sender_id, content, created_at')
          .eq('group_id', convo.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true })
          .limit(100)

        setMessages((data as GroupMessage[]) || [])
      }

      setMessagesLoading(false)
    }

    fetchMessages()

    // Subscribe to new messages
    let channel: RealtimeChannel

    if (convo.type === 'dm') {
      const channelName = `dm-${[user.id, convo.id].sort().join('-')}`
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
            const newMsg = payload.new as Message
            // Skip messages from current user (already added via optimistic update)
            if (newMsg.sender_id === user.id) return

            const isRelevant = newMsg.sender_id === convo.id && newMsg.recipient_id === user.id

            if (isRelevant) {
              // Play ping sound for new message
              playPingSound()
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id)) return prev
                return [...prev, newMsg]
              })
            }
          }
        )
        .subscribe()
    } else {
      channel = supabase
        .channel(`group-${convo.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=eq.${convo.id}`,
          },
          (payload) => {
            const newMsg = payload.new as GroupMessage
            // Skip messages from current user (already added via optimistic update)
            if (newMsg.sender_id === user.id) return

            // Play ping sound for new message
            playPingSound()
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          }
        )
        .subscribe()
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedConversation, currentUser])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message
  const handleSend = async () => {
    if (!input.trim() || !selectedConversation || !currentUser || sending) return

    setSending(true)
    const content = input.trim()
    setInput('')

    // Optimistic update
    const tempId = `temp-${Date.now()}`
    const tempMsg: Message | GroupMessage = selectedConversation.type === 'dm'
      ? {
          id: tempId,
          sender_id: currentUser.id,
          recipient_id: selectedConversation.id,
          content,
          created_at: new Date().toISOString(),
        }
      : {
          id: tempId,
          group_id: selectedConversation.id,
          sender_id: currentUser.id,
          content,
          created_at: new Date().toISOString(),
        }

    setMessages(prev => [...prev, tempMsg])

    try {
      if (selectedConversation.type === 'dm') {
        const { error } = await supabase
          .from('messages')
          .insert({
            sender_id: currentUser.id,
            recipient_id: selectedConversation.id,
            content,
          })

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('group_messages')
          .insert({
            group_id: selectedConversation.id,
            sender_id: currentUser.id,
            content,
          })

        if (error) throw error
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(content)
    }

    setSending(false)
  }

  // Filter conversations by search
  const filteredConversations = conversations.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const dmConversations = filteredConversations.filter(c => c.type === 'dm')
  const groupConversations = filteredConversations.filter(c => c.type === 'group')

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Get sender name for group messages
  const getSenderName = (msg: Message | GroupMessage) => {
    if (msg.sender_id === currentUser?.id) return 'You'
    const sender = users.find(u => u.id === msg.sender_id)
    return sender ? `${sender.first_name} ${sender.last_name}` : 'Unknown'
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] flex glass-card rounded-2xl overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 border-r border-white/10 flex flex-col bg-black/20">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-yellow-400" />
              ByeMessage
            </h1>
            <button
              onClick={() => setShowNewGroupModal(true)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="New Group"
            >
              <Plus className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 glass-input text-sm"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {/* Groups Section */}
          <div className="py-2">
            <button
              onClick={() => setShowGroupsExpanded(!showGroupsExpanded)}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:bg-white/5"
            >
              {showGroupsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Channels
              <span className="ml-auto text-gray-500">{groupConversations.length}</span>
            </button>

            {showGroupsExpanded && (
              <div className="space-y-0.5">
                {groupConversations.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-gray-500">No channels yet</p>
                ) : (
                  groupConversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors text-left ${
                        selectedConversation?.id === conv.id ? 'bg-yellow-500/10 border-l-2 border-yellow-400' : 'border-l-2 border-transparent'
                      }`}
                    >
                      <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className={`text-sm truncate ${selectedConversation?.id === conv.id ? 'text-yellow-400 font-medium' : 'text-gray-300'}`}>
                        {conv.name}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="ml-auto min-w-5 h-5 px-1.5 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Direct Messages Section */}
          <div className="py-2">
            <button
              onClick={() => setShowDMsExpanded(!showDMsExpanded)}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:bg-white/5"
            >
              {showDMsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Direct Messages
              <span className="ml-auto text-gray-500">{dmConversations.length}</span>
            </button>

            {showDMsExpanded && (
              <div className="space-y-0.5">
                {dmConversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left ${
                      selectedConversation?.id === conv.id ? 'bg-yellow-500/10 border-l-2 border-yellow-400' : 'border-l-2 border-transparent'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-xs">
                        {conv.user?.first_name?.[0]}{conv.user?.last_name?.[0]}
                      </div>
                      {conv.isOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-gray-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${selectedConversation?.id === conv.id ? 'text-yellow-400 font-medium' : 'text-gray-300'}`}>
                        {conv.name}
                      </p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="flex-shrink-0 min-w-5 h-5 px-1.5 bg-yellow-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedConversation.type === 'group' ? (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                    <Hash className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold">
                      {selectedConversation.user?.first_name?.[0]}{selectedConversation.user?.last_name?.[0]}
                    </div>
                    {selectedConversation.isOnline && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                    )}
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-white">
                    {selectedConversation.type === 'group' ? '#' : ''}{selectedConversation.name}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {selectedConversation.type === 'group'
                      ? `${selectedConversation.group?.description || 'Group channel'}`
                      : selectedConversation.isOnline ? 'Online' : 'Offline'
                    }
                  </p>
                </div>
              </div>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <MoreHorizontal className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8 text-yellow-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">No messages yet</h3>
                  <p className="text-gray-400 text-sm">Start the conversation by sending a message!</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOwn = msg.sender_id === currentUser?.id
                  const showSender = selectedConversation.type === 'group' && !isOwn
                  const prevMsg = messages[idx - 1]
                  const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id

                  return (
                    <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-3 max-w-[70%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                        {!isOwn && showAvatar && (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-xs flex-shrink-0">
                            {getSenderName(msg).split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                        {!isOwn && !showAvatar && <div className="w-8" />}
                        <div>
                          {showSender && showAvatar && (
                            <p className="text-xs text-gray-400 mb-1 ml-1">{getSenderName(msg)}</p>
                          )}
                          <div
                            className={`px-4 py-2.5 rounded-2xl ${
                              isOwn
                                ? 'bg-yellow-500/20 border border-yellow-500/30 text-white'
                                : 'bg-white/5 border border-white/10 text-white'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                          <p className={`text-xs mt-1 ${isOwn ? 'text-right' : 'text-left'} text-gray-500`}>
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-black/20">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  placeholder={`Message ${selectedConversation.type === 'group' ? '#' : ''}${selectedConversation.name}`}
                  className="flex-1 glass-input px-4 py-3 text-sm"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="px-5 py-3 glass-button-gold rounded-xl disabled:opacity-50 transition-all hover:scale-105 disabled:hover:scale-100"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 flex items-center justify-center mb-6">
              <MessageCircle className="w-10 h-10 text-yellow-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to ByeMessage</h2>
            <p className="text-gray-400 max-w-md">
              Select a conversation from the sidebar to start messaging your team, or create a new channel to collaborate with your colleagues.
            </p>
          </div>
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroupModal && (
        <NewGroupModal
          users={users}
          currentUser={currentUser}
          onClose={() => setShowNewGroupModal(false)}
          onCreated={(group) => {
            setGroups(prev => [...prev, group])
            setShowNewGroupModal(false)
          }}
        />
      )}
    </div>
  )
}

// New Group Modal Component
function NewGroupModal({
  users,
  currentUser,
  onClose,
  onCreated,
}: {
  users: User[]
  currentUser: User | null
  onClose: () => void
  onCreated: (group: MessageGroup) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleCreate = async () => {
    if (!name.trim() || !currentUser) return

    setCreating(true)

    try {
      // Get organization_id
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', currentUser.id)
        .single()

      // Create group
      const { data: group, error: groupError } = await supabase
        .from('message_groups')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          created_by: currentUser.id,
          organization_id: userData?.organization_id,
        })
        .select()
        .single()

      if (groupError) throw groupError

      // Add creator as admin
      await supabase
        .from('message_group_members')
        .insert({
          group_id: group.id,
          user_id: currentUser.id,
          role: 'admin',
        })

      // Add selected members
      if (selectedMembers.length > 0) {
        await supabase
          .from('message_group_members')
          .insert(
            selectedMembers.map(userId => ({
              group_id: group.id,
              user_id: userId,
              role: 'member',
            }))
          )
      }

      onCreated(group)
    } catch (error) {
      console.error('Failed to create group:', error)
    }

    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Create Channel</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Channel Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. sales-team"
              className="w-full glass-input px-4 py-2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              className="w-full glass-input px-4 py-2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Add Members</label>
            <div className="max-h-48 overflow-y-auto space-y-1 glass-input p-2 rounded-xl">
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => toggleMember(user.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    selectedMembers.includes(user.id) ? 'bg-yellow-500/20' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-xs">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                  <span className="text-sm text-white">{user.first_name} {user.last_name}</span>
                  {selectedMembers.includes(user.id) && (
                    <span className="ml-auto text-yellow-400 text-xs">Selected</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 glass-button rounded-xl">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="flex-1 px-4 py-2.5 glass-button-gold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create Channel
          </button>
        </div>
      </div>
    </div>
  )
}
