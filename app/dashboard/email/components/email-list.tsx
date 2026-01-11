'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Star,
  Paperclip,
  Trash2,
  Archive,
  MailOpen,
  Mail,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EmailThread } from '@/types/email.types'
import { formatEmailDate } from '@/lib/email-utils'

interface EmailListProps {
  threads: (EmailThread & {
    emails?: {
      id: string
      from_address: string
      from_name: string | null
      snippet: string | null
      sent_at: string | null
      created_at: string
      is_read: boolean
    }[]
  })[]
  selectedAccountId: string
  emptyMessage?: string
  currentPage?: number
  totalCount?: number
  pageSize?: number
}

export function EmailList({
  threads,
  selectedAccountId,
  emptyMessage = 'No emails',
  currentPage = 1,
  totalCount = 0,
  pageSize = 20,
}: EmailListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const totalPages = Math.ceil(totalCount / pageSize)
  const hasPrevPage = currentPage > 1
  const hasNextPage = currentPage < totalPages

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page === 1) {
      params.delete('page')
    } else {
      params.set('page', String(page))
    }
    router.push(`?${params.toString()}`)
  }
  const [loading, setLoading] = useState<string | null>(null)

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === threads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(threads.map(t => t.id)))
    }
  }

  const toggleStar = async (threadId: string, isStarred: boolean, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLoading(threadId)

    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ is_starred: !isStarred })
      .eq('id', threadId)

    router.refresh()
    setLoading(null)
  }

  const markAsRead = async (threadIds: string[]) => {
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ is_read: true })
      .in('id', threadIds)

    await supabase
      .from('emails')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('thread_id', threadIds)

    router.refresh()
    setSelectedIds(new Set())
  }

  const moveToTrash = async (threadIds: string[]) => {
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'trash', updated_at: new Date().toISOString() })
      .in('id', threadIds)

    router.refresh()
    setSelectedIds(new Set())
  }

  const archiveThreads = async (threadIds: string[]) => {
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'archive', updated_at: new Date().toISOString() })
      .in('id', threadIds)

    router.refresh()
    setSelectedIds(new Set())
  }

  if (threads.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Mail className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
        <button
          onClick={selectAll}
          className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
        >
          {selectedIds.size === threads.length ? (
            <CheckSquare className="w-5 h-5" />
          ) : (
            <Square className="w-5 h-5" />
          )}
        </button>

        {selectedIds.size > 0 && (
          <>
            <div className="h-6 w-px bg-white/10" />
            <button
              onClick={() => markAsRead(Array.from(selectedIds))}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              title="Mark as read"
            >
              <MailOpen className="w-5 h-5" />
            </button>
            <button
              onClick={() => archiveThreads(Array.from(selectedIds))}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              title="Archive"
            >
              <Archive className="w-5 h-5" />
            </button>
            <button
              onClick={() => moveToTrash(Array.from(selectedIds))}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-400 ml-2">
              {selectedIds.size} selected
            </span>
          </>
        )}
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {threads.map((thread) => {
          const latestEmail = thread.emails?.[0]
          const isSelected = selectedIds.has(thread.id)

          return (
            <Link
              key={thread.id}
              href={`/dashboard/email/${thread.id}`}
              className={`flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                !thread.is_read ? 'bg-white/[0.02]' : ''
              } ${isSelected ? 'bg-yellow-500/10' : ''}`}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => toggleSelect(thread.id, e)}
                className="p-1 rounded hover:bg-white/10 text-gray-400"
              >
                {isSelected ? (
                  <CheckSquare className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>

              {/* Star */}
              <button
                onClick={(e) => toggleStar(thread.id, thread.is_starred, e)}
                className={`p-1 rounded hover:bg-white/10 ${
                  thread.is_starred ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300'
                }`}
                disabled={loading === thread.id}
              >
                <Star className={`w-5 h-5 ${thread.is_starred ? 'fill-yellow-400' : ''}`} />
              </button>

              {/* Sender */}
              <div className="w-48 flex-shrink-0">
                <p className={`text-sm truncate ${!thread.is_read ? 'text-white font-medium' : 'text-gray-300'}`}>
                  {latestEmail?.from_name || latestEmail?.from_address || 'Unknown'}
                </p>
              </div>

              {/* Subject & Snippet */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${!thread.is_read ? 'text-white font-medium' : 'text-gray-300'}`}>
                    {thread.subject || '(no subject)'}
                  </span>
                  {thread.message_count > 1 && (
                    <span className="flex-shrink-0 text-xs text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                      {thread.message_count}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {latestEmail?.snippet || ''}
                </p>
              </div>

              {/* Attachment indicator */}
              {thread.has_attachments && (
                <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
              )}

              {/* Date */}
              <div className="w-24 text-right flex-shrink-0">
                <span className={`text-sm ${!thread.is_read ? 'text-white' : 'text-gray-500'}`}>
                  {formatEmailDate(thread.last_message_at)}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={!hasPrevPage}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!hasNextPage}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
