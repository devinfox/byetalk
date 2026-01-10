'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Star,
  Trash2,
  Archive,
  Reply,
  Forward,
  MoreVertical,
  Paperclip,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react'
import { EmailThread, Email, EmailAccount, EmailAttachment } from '@/types/email.types'
import { formatEmailDateFull } from '@/lib/email-utils'
import { EmailCompose } from '../components/email-compose'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Helper to format a single recipient (handles both string and object formats)
function formatRecipient(recipient: any): string {
  if (!recipient) return ''
  if (typeof recipient === 'string') return recipient
  if (recipient.email) {
    return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email
  }
  return String(recipient)
}

// Helper to format multiple recipients
function formatRecipients(recipients: any): string {
  if (!recipients) return ''
  if (!Array.isArray(recipients)) return formatRecipient(recipients)
  return recipients.map(formatRecipient).join(', ')
}

interface ThreadViewProps {
  thread: EmailThread & { email_account: Pick<EmailAccount, 'id' | 'email_address' | 'display_name' | 'user_id'> | null }
  emails: (Email & { attachments: EmailAttachment[] })[]
  accounts: EmailAccount[]
}

export function ThreadView({ thread, emails, accounts }: ThreadViewProps) {
  const router = useRouter()
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(
    new Set(emails.length > 0 ? [emails[emails.length - 1].id] : [])
  )
  const [showReply, setShowReply] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [replyToEmail, setReplyToEmail] = useState<Email | null>(null)
  const [loading, setLoading] = useState(false)

  const toggleExpanded = (emailId: string) => {
    const newExpanded = new Set(expandedEmails)
    if (newExpanded.has(emailId)) {
      newExpanded.delete(emailId)
    } else {
      newExpanded.add(emailId)
    }
    setExpandedEmails(newExpanded)
  }

  const toggleStar = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ is_starred: !thread.is_starred })
      .eq('id', thread.id)
    router.refresh()
    setLoading(false)
  }

  const moveToTrash = async () => {
    if (!confirm('Move this conversation to trash?')) return
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'trash', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    router.push('/dashboard/email')
  }

  const archiveThread = async () => {
    const supabase = createClient()
    await supabase
      .from('email_threads')
      .update({ folder: 'archive', updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    router.push('/dashboard/email')
  }

  const handleReply = (email: Email) => {
    setReplyToEmail(email)
    setShowReply(true)
    setShowForward(false)
  }

  const handleForward = (email: Email) => {
    setReplyToEmail(email)
    setShowForward(true)
    setShowReply(false)
  }

  const closeCompose = () => {
    setShowReply(false)
    setShowForward(false)
    setReplyToEmail(null)
  }

  const getDisplayName = (email: Email, isOutbound: boolean) => {
    if (isOutbound) {
      return email.from_name || email.from_address
    }
    return email.from_name || email.from_address.split('@')[0]
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-white/10">
        <Link
          href="/dashboard/email"
          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <h1 className="flex-1 text-lg font-medium text-white truncate">
          {thread.subject || '(no subject)'}
        </h1>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleStar}
            disabled={loading}
            className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${
              thread.is_starred ? 'text-yellow-400' : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Star className={`w-5 h-5 ${thread.is_starred ? 'fill-yellow-400' : ''}`} />
          </button>
          <button
            onClick={archiveThread}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Archive"
          >
            <Archive className="w-5 h-5" />
          </button>
          <button
            onClick={moveToTrash}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Emails */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {emails.map((email, index) => {
            const isExpanded = expandedEmails.has(email.id)
            const isOutbound = !email.is_inbound
            const isLast = index === emails.length - 1

            return (
              <div key={email.id} className="glass-card overflow-hidden">
                {/* Email Header */}
                <div
                  className={`flex items-start gap-4 p-4 cursor-pointer hover:bg-white/5 transition-colors ${
                    !isExpanded ? 'border-b-0' : ''
                  }`}
                  onClick={() => toggleExpanded(email.id)}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isOutbound ? 'bg-yellow-500/20' : 'bg-blue-500/20'
                  }`}>
                    <span className={`text-sm font-medium ${isOutbound ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {(getDisplayName(email, isOutbound) || 'U')[0].toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          {getDisplayName(email, isOutbound)}
                        </span>
                        {isOutbound && (
                          <span className="text-xs text-gray-500">to {formatRecipient(email.to_addresses?.[0])}</span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {formatEmailDateFull(email.sent_at || email.created_at)}
                      </span>
                    </div>

                    {!isExpanded && (
                      <p className="text-sm text-gray-400 truncate mt-1">
                        {email.snippet || '(no content)'}
                      </p>
                    )}
                  </div>

                  <button className="text-gray-400">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Email Body */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    {/* Email details */}
                    <div className="text-sm text-gray-400 mb-4 pl-14">
                      <div>From: {email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address}</div>
                      <div>To: {formatRecipients(email.to_addresses)}</div>
                      {email.cc_addresses && email.cc_addresses.length > 0 && (
                        <div>Cc: {formatRecipients(email.cc_addresses)}</div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="pl-14">
                      {email.body_html ? (
                        <div
                          className="prose prose-invert max-w-none text-sm"
                          dangerouslySetInnerHTML={{ __html: email.body_html }}
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans">
                          {email.body_text}
                        </pre>
                      )}

                      {/* Attachments */}
                      {email.attachments && email.attachments.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <p className="text-sm text-gray-400 mb-2">
                            {email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {email.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.storage_path || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                              >
                                <Paperclip className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-white truncate max-w-[150px]">
                                  {attachment.filename}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {((attachment.size_bytes || 0) / 1024).toFixed(0)}KB
                                </span>
                                <Download className="w-4 h-4 text-gray-400" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReply(email) }}
                          className="flex items-center gap-2 px-4 py-2 glass-button rounded-lg text-sm"
                        >
                          <Reply className="w-4 h-4" />
                          Reply
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleForward(email) }}
                          className="flex items-center gap-2 px-4 py-2 glass-button rounded-lg text-sm"
                        >
                          <Forward className="w-4 h-4" />
                          Forward
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Quick Reply */}
          {!showReply && !showForward && emails.length > 0 && (
            <button
              onClick={() => handleReply(emails[emails.length - 1])}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 glass-card hover:bg-white/5 rounded-xl transition-colors"
            >
              <Reply className="w-5 h-5 text-yellow-400" />
              <span className="text-white font-medium">Reply</span>
            </button>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {(showReply || showForward) && replyToEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <EmailCompose
            accounts={accounts.filter((a: any) => a.domain?.verification_status === 'verified')}
            defaultAccountId={thread.email_account_id}
            replyTo={showReply ? {
              email_id: replyToEmail.id,
              thread_id: thread.id,
              to: !replyToEmail.is_inbound
                ? formatRecipient(replyToEmail.to_addresses?.[0])
                : replyToEmail.from_address,
              subject: `Re: ${thread.subject || ''}`,
              body: `<br><br><div style="border-left: 2px solid #444; padding-left: 10px; margin-left: 0; color: #888;">On ${formatEmailDateFull(replyToEmail.sent_at || replyToEmail.created_at)}, ${replyToEmail.from_name || replyToEmail.from_address} wrote:<br><br>${replyToEmail.body_html || replyToEmail.body_text || ''}</div>`,
            } : undefined}
            forward={showForward ? {
              email_id: replyToEmail.id,
              subject: `Fwd: ${thread.subject || ''}`,
              body: `<br><br>---------- Forwarded message ---------<br>From: ${replyToEmail.from_name || replyToEmail.from_address}<br>Date: ${formatEmailDateFull(replyToEmail.sent_at || replyToEmail.created_at)}<br>Subject: ${thread.subject || ''}<br>To: ${formatRecipients(replyToEmail.to_addresses)}<br><br>${replyToEmail.body_html || replyToEmail.body_text || ''}`,
            } : undefined}
            onClose={closeCompose}
            isFullscreen
          />
        </div>
      )}
    </div>
  )
}
