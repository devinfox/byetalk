'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  AlertOctagon,
  Archive,
  Star,
  Plus,
  Settings,
  ChevronDown,
  ChevronRight,
  Mail,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EmailAccount, EmailFolder } from '@/types/email.types'

interface EmailSidebarProps {
  userId: string
}

interface FolderItem {
  name: string
  folder: EmailFolder
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const folders: FolderItem[] = [
  { name: 'Inbox', folder: 'inbox', href: '/dashboard/email', icon: Inbox },
  { name: 'Starred', folder: 'inbox', href: '/dashboard/email?starred=true', icon: Star },
  { name: 'Sent', folder: 'sent', href: '/dashboard/email/sent', icon: Send },
  { name: 'Drafts', folder: 'drafts', href: '/dashboard/email/drafts', icon: FileEdit },
  { name: 'Spam', folder: 'spam', href: '/dashboard/email/spam', icon: AlertOctagon },
  { name: 'Trash', folder: 'trash', href: '/dashboard/email/trash', icon: Trash2 },
  { name: 'Archive', folder: 'archive', href: '/dashboard/email/archive', icon: Archive },
]

export function EmailSidebar({ userId }: EmailSidebarProps) {
  const pathname = usePathname()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null)
  const [folderCounts, setFolderCounts] = useState<Record<string, { total: number; unread: number }>>({})
  const [aiDraftsCount, setAiDraftsCount] = useState(0)
  const [accountsExpanded, setAccountsExpanded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [hasMicrosoftAccount, setHasMicrosoftAccount] = useState(false)

  useEffect(() => {
    loadAccounts()
    loadAiDraftsCount()
    triggerInitialMicrosoftSync()

    // Set up automatic email polling every 60 seconds for Microsoft accounts
    const pollInterval = setInterval(() => {
      if (hasMicrosoftAccount && !syncing) {
        console.log('[Email Sidebar] Auto-polling for new emails...')
        handleAutoSync()
      }
    }, 60000) // 60 seconds

    return () => clearInterval(pollInterval)
  }, [userId, hasMicrosoftAccount, syncing])

  // Trigger initial Microsoft email sync if needed (runs once on first login)
  const triggerInitialMicrosoftSync = async () => {
    try {
      const response = await fetch('/api/email/microsoft/initial-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.ok) {
        const result = await response.json()
        if (result.results?.some((r: any) => r.created > 0)) {
          // Reload accounts to refresh counts after sync
          loadAccounts()
        }
      }
    } catch (error) {
      // Silently fail - initial sync is best effort
      console.log('[Email Sidebar] Initial sync check completed')
    }
  }

  const loadAiDraftsCount = async () => {
    const supabase = createClient()
    const { count } = await supabase
      .from('email_drafts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')

    setAiDraftsCount(count || 0)
  }

  // Load folder counts whenever accounts change
  useEffect(() => {
    if (accounts.length > 0) {
      loadFolderCounts(accounts.map(a => a.id))
    }
  }, [accounts])

  const loadAccounts = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('email_accounts')
      .select('*, email_domains(*)')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('is_primary', { ascending: false })

    if (data && data.length > 0) {
      setAccounts(data)
      // Select primary account or first one
      const primary = data.find(a => a.is_primary) || data[0]
      setSelectedAccount(primary)
      // Check for Microsoft accounts
      setHasMicrosoftAccount(data.some((a: any) => a.provider === 'microsoft'))
    }
    setLoading(false)
  }

  // Auto sync for polling (silent, doesn't show loading state)
  const handleAutoSync = async () => {
    try {
      const response = await fetch('/api/email/microsoft/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: false }),
      })
      if (response.ok) {
        const result = await response.json()
        // Only reload if new emails were created
        if (result.results?.some((r: any) => r.created > 0)) {
          console.log('[Email Sidebar] New emails found, refreshing...')
          loadAccounts()
        }
      }
    } catch (error) {
      console.error('[Email Sidebar] Auto-sync error:', error)
    }
  }

  // Manual sync for Microsoft accounts
  const handleManualSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const response = await fetch('/api/email/microsoft/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: true }),
      })
      if (response.ok) {
        // Reload to show new emails
        loadAccounts()
      }
    } catch (error) {
      console.error('[Email Sidebar] Sync error:', error)
    }
    setSyncing(false)
  }

  const loadFolderCounts = async (accountIds: string[]) => {
    if (accountIds.length === 0) {
      setFolderCounts({})
      return
    }

    const supabase = createClient()

    // Double-check that we only query accounts belonging to this user
    const { data: verifiedAccounts } = await supabase
      .from('email_accounts')
      .select('id')
      .in('id', accountIds)
      .eq('user_id', userId)
      .eq('is_deleted', false)

    const verifiedAccountIds = verifiedAccounts?.map(a => a.id) || []

    if (verifiedAccountIds.length === 0) {
      setFolderCounts({})
      return
    }

    const { data } = await supabase
      .from('email_threads')
      .select('folder, is_read')
      .in('email_account_id', verifiedAccountIds)
      .eq('is_deleted', false)

    if (data) {
      const counts: Record<string, { total: number; unread: number }> = {}
      for (const thread of data) {
        if (!counts[thread.folder]) {
          counts[thread.folder] = { total: 0, unread: 0 }
        }
        counts[thread.folder].total++
        if (!thread.is_read) {
          counts[thread.folder].unread++
        }
      }
      setFolderCounts(counts)
    }
  }

  const isActive = (href: string) => {
    if (href === '/dashboard/email') {
      return pathname === href && !pathname.includes('starred')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className="w-64 glass-card-subtle flex flex-col border-r border-white/10">
      {/* Compose Button */}
      <div className="p-4">
        <Link
          href="/dashboard/email/compose"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 glass-button-gold rounded-xl text-sm font-medium"
        >
          <Plus className="w-5 h-5" />
          Compose
        </Link>
      </div>

      {/* Folders */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {folders.map((item) => {
          const active = isActive(item.href)
          const count = folderCounts[item.folder]
          const unreadCount = count?.unread || 0
          const showBadge = item.folder === 'inbox' && unreadCount > 0

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1">{item.name}</span>
              {showBadge && (
                <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500 text-black rounded-full">
                  {unreadCount}
                </span>
              )}
            </Link>
          )
        })}

        {/* AI Drafts - Special Section */}
        <div className="pt-2 mt-2 border-t border-white/10">
          <Link
            href="/dashboard/email/ai-drafts"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              pathname === '/dashboard/email/ai-drafts'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="flex-1">AI Drafts</span>
            {aiDraftsCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-yellow-500 to-amber-500 text-black rounded-full">
                {aiDraftsCount}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Accounts Section */}
      <div className="px-3 py-2 border-t border-white/10">
        <button
          onClick={() => setAccountsExpanded(!accountsExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
        >
          {accountsExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span>Accounts</span>
        </button>

        {accountsExpanded && (
          <div className="space-y-1 mt-1">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
            ) : accounts.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No accounts</div>
            ) : (
              accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => setSelectedAccount(account)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    selectedAccount?.id === account.id
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
                  }`}
                >
                  <Mail className="w-4 h-4" />
                  <span className="truncate flex-1 text-left">{account.email_address}</span>
                  {account.is_primary && (
                    <span className="text-xs text-yellow-400">Primary</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Settings & Add Domain */}
      <div className="p-3 border-t border-white/10 space-y-1">
        {hasMicrosoftAccount && (
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Emails'}
          </button>
        )}
        <Link
          href="/dashboard/email/settings/domains"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Domain
        </Link>
        <Link
          href="/dashboard/email/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-all"
        >
          <Settings className="w-4 h-4" />
          Email Settings
        </Link>
      </div>
    </div>
  )
}
