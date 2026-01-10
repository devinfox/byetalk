'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X,
  Minimize2,
  Maximize2,
  Paperclip,
  Send,
  Trash2,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  List,
  Link,
  Image,
  Clock,
  FolderOpen,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { EmailAccount } from '@/types/email.types'
import { useRouter } from 'next/navigation'
import { useDocuments } from '@/lib/document-context'
import { useNimbus } from '@/components/nimbus'

interface EmailComposeProps {
  accounts: EmailAccount[]
  defaultAccountId?: string
  replyTo?: {
    email_id: string
    thread_id: string
    to: string
    subject: string
    body?: string
  }
  forward?: {
    email_id: string
    subject: string
    body?: string
    attachments?: any[]
  }
  draftId?: string // Load from AI-generated draft
  onClose: () => void
  onMinimize?: () => void
  isMinimized?: boolean
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function EmailCompose({
  accounts,
  defaultAccountId,
  replyTo,
  forward,
  draftId,
  onClose,
  onMinimize,
  isMinimized = false,
  isFullscreen = false,
  onToggleFullscreen,
}: EmailComposeProps) {
  const router = useRouter()
  const { pendingAttachments, clearPendingAttachments, openPanel } = useDocuments()
  const { showNimbus } = useNimbus()
  const [fromAccountId, setFromAccountId] = useState(
    defaultAccountId || accounts.find(a => a.is_primary)?.id || accounts[0]?.id || ''
  )
  const [to, setTo] = useState<string[]>(replyTo ? [replyTo.to] : [])
  const [toInput, setToInput] = useState('')
  const [cc, setCc] = useState<string[]>([])
  const [ccInput, setCcInput] = useState('')
  const [bcc, setBcc] = useState<string[]>([])
  const [bccInput, setBccInput] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(
    replyTo?.subject || forward?.subject || ''
  )
  const [body, setBody] = useState(replyTo?.body || forward?.body || '')
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAiDraft, setIsAiDraft] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null)
  const [recipientName, setRecipientName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const selectedAccount = accounts.find(a => a.id === fromAccountId)

  // Load AI-generated draft if draftId provided
  useEffect(() => {
    if (!draftId) return

    const loadDraft = async () => {
      setLoadingDraft(true)
      try {
        const response = await fetch(`/api/email/draft?id=${draftId}`)
        if (!response.ok) {
          throw new Error('Failed to load draft')
        }

        const draft = await response.json()

        // Pre-populate fields from draft
        if (draft.to_email) {
          setTo([draft.to_email])
        }
        if (draft.subject) {
          setSubject(draft.subject)
        }
        if (draft.body_html) {
          setBody(draft.body_html)
        }
        if (draft.from_account_id) {
          setFromAccountId(draft.from_account_id)
        }

        // Load attachments
        if (draft.attachments?.length > 0) {
          for (const doc of draft.attachments) {
            try {
              const fileResponse = await fetch(doc.public_url)
              const blob = await fileResponse.blob()
              const file = new File([blob], doc.file_name, { type: doc.mime_type || 'application/octet-stream' })
              setAttachments(prev => [...prev, file])
            } catch (err) {
              console.error('Failed to load attachment:', doc.file_name, err)
            }
          }
        }

        setIsAiDraft(draft.ai_generated || false)
        setCurrentDraftId(draftId)
        setLinkedTaskId(draft.task_id || null)
        setRecipientName(draft.to_name || null)
      } catch (err) {
        console.error('Error loading draft:', err)
        setError('Failed to load draft')
      }
      setLoadingDraft(false)
    }

    loadDraft()
  }, [draftId])

  // Handle pending attachments from document library
  useEffect(() => {
    if (pendingAttachments.length > 0) {
      const fetchAndAttach = async () => {
        for (const doc of pendingAttachments) {
          if (!doc.public_url) {
            console.error('Document has no public URL:', doc.file_name)
            continue
          }
          try {
            // Fetch the file from the public URL
            const response = await fetch(doc.public_url)
            const blob = await response.blob()
            const file = new File([blob], doc.file_name, { type: doc.mime_type || 'application/octet-stream' })
            setAttachments(prev => [...prev, file])
          } catch (err) {
            console.error('Failed to fetch document:', doc.file_name, err)
          }
        }
        clearPendingAttachments()
      }
      fetchAndAttach()
    }
  }, [pendingAttachments, clearPendingAttachments])

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const addRecipient = (
    type: 'to' | 'cc' | 'bcc',
    email: string
  ) => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!emailRegex.test(trimmedEmail)) return false

    switch (type) {
      case 'to':
        if (!to.includes(trimmedEmail)) {
          setTo([...to, trimmedEmail])
          setToInput('')
        }
        break
      case 'cc':
        if (!cc.includes(trimmedEmail)) {
          setCc([...cc, trimmedEmail])
          setCcInput('')
        }
        break
      case 'bcc':
        if (!bcc.includes(trimmedEmail)) {
          setBcc([...bcc, trimmedEmail])
          setBccInput('')
        }
        break
    }
    return true
  }

  const removeRecipient = (type: 'to' | 'cc' | 'bcc', email: string) => {
    switch (type) {
      case 'to':
        setTo(to.filter(e => e !== email))
        break
      case 'cc':
        setCc(cc.filter(e => e !== email))
        break
      case 'bcc':
        setBcc(bcc.filter(e => e !== email))
        break
    }
  }

  const handleKeyDown = (
    e: React.KeyboardEvent,
    type: 'to' | 'cc' | 'bcc',
    value: string
  ) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      if (value) addRecipient(type, value)
    }
    if (e.key === 'Backspace' && !value) {
      switch (type) {
        case 'to':
          if (to.length > 0) setTo(to.slice(0, -1))
          break
        case 'cc':
          if (cc.length > 0) setCc(cc.slice(0, -1))
          break
        case 'bcc':
          if (bcc.length > 0) setBcc(bcc.slice(0, -1))
          break
      }
    }
  }

  const handlePaste = (
    e: React.ClipboardEvent,
    type: 'to' | 'cc' | 'bcc'
  ) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const emails = text.split(/[,;\s]+/).filter(Boolean)
    emails.forEach(email => addRecipient(type, email))
  }

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setAttachments([...attachments, ...Array.from(files)])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    bodyRef.current?.focus()
  }

  const handleSend = async () => {
    setError(null)

    // Validate
    if (!fromAccountId) {
      setError('Please select a sender account')
      return
    }

    if (to.length === 0) {
      setError('Please add at least one recipient')
      return
    }

    if (!subject.trim()) {
      if (!confirm('Send this email without a subject?')) {
        return
      }
    }

    const bodyHtml = bodyRef.current?.innerHTML || ''
    const bodyText = bodyRef.current?.innerText || ''

    if (!bodyText.trim()) {
      if (!confirm('Send this email without any content?')) {
        return
      }
    }

    setSending(true)

    try {
      // Upload attachments if any
      let attachmentData: any[] = []
      if (attachments.length > 0) {
        for (const file of attachments) {
          const reader = new FileReader()
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => {
              const result = reader.result as string
              // Remove data URL prefix
              resolve(result.split(',')[1])
            }
            reader.readAsDataURL(file)
          })

          attachmentData.push({
            content: base64,
            filename: file.name,
            content_type: file.type,
            size: file.size,
          })
        }
      }

      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: fromAccountId,
          to,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject,
          body_text: bodyText,
          body_html: bodyHtml,
          reply_to_email_id: replyTo?.email_id,
          thread_id: replyTo?.thread_id,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email')
      }

      // Mark AI draft as sent if applicable
      let taskWasCompleted = false
      let contactName = recipientName
      if (currentDraftId) {
        try {
          const draftResponse = await fetch('/api/email/draft', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              draft_id: currentDraftId,
              status: 'sent'
            })
          })

          const draftResult = await draftResponse.json()
          console.log('[Email Compose] Draft update result:', draftResult)
          taskWasCompleted = draftResult.taskCompleted
          if (draftResult.recipientName) {
            contactName = draftResult.recipientName
          }
        } catch (draftError) {
          console.error('Failed to update draft status:', draftError)
        }
      }

      // Success - close compose and refresh
      onClose()
      router.refresh()

      // Show Nimbus celebration AFTER close (so it persists)
      // Celebrate when: task completed OR AI draft sent
      if (taskWasCompleted) {
        // Small delay to ensure the page has refreshed
        setTimeout(() => {
          showNimbus({
            mood: 'happy',
            title: 'Great work!',
            message: `Email sent to ${contactName || 'your contact'} and task marked complete.`,
            subMessage: 'Keep crushing it!',
            dismissLabel: 'Thanks!',
          })
        }, 500)
      } else if (isAiDraft && currentDraftId) {
        // Celebrate sending an AI-generated draft (even without linked task)
        setTimeout(() => {
          showNimbus({
            mood: 'happy',
            title: 'Nice one!',
            message: `Email sent to ${contactName || 'your contact'}!`,
            subMessage: 'Way to follow through on your commitment!',
            dismissLabel: 'Thanks!',
          })
        }, 500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email')
    }

    setSending(false)
  }

  const handleDiscard = () => {
    if (to.length > 0 || subject || (bodyRef.current?.innerText || '').trim()) {
      if (!confirm('Discard this draft?')) {
        return
      }
    }
    onClose()
  }

  // Minimized view
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-0 right-4 w-72 glass-card rounded-t-xl cursor-pointer"
        onClick={onMinimize}
      >
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <span className="text-sm text-white font-medium truncate">
            {subject || 'New Message'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMinimize?.() }}
              className="p-1 rounded hover:bg-white/10 text-gray-400"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDiscard() }}
              className="p-1 rounded hover:bg-white/10 text-gray-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show loading state while draft is loading
  if (loadingDraft) {
    return (
      <div className={`glass-card flex flex-col items-center justify-center ${isFullscreen ? 'fixed inset-4 z-50' : 'w-full max-w-2xl h-96'}`}>
        <Loader2 className="w-8 h-8 text-yellow-400 animate-spin mb-3" />
        <p className="text-gray-400">Loading draft...</p>
      </div>
    )
  }

  return (
    <div className={`glass-card flex flex-col ${isFullscreen ? 'fixed inset-4 z-50' : 'w-full max-w-2xl'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">
            {replyTo ? 'Reply' : forward ? 'Forward' : isAiDraft ? 'AI Draft' : 'New Message'}
          </span>
          {isAiDraft && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-xs text-yellow-400">
              <Sparkles className="w-3 h-3" />
              AI Generated
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="p-1.5 rounded hover:bg-white/10 text-gray-400"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded hover:bg-white/10 text-gray-400"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleDiscard}
            className="p-1.5 rounded hover:bg-white/10 text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* AI Draft Banner */}
      {isAiDraft && (
        <div className="px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/30 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 text-sm font-medium">Generated by Nimbus</p>
            <p className="text-yellow-400/70 text-xs mt-0.5">
              Please review this draft carefully before sending. AI-generated content may need adjustments.
            </p>
          </div>
        </div>
      )}

      {/* From */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <label className="text-sm text-gray-400 w-14">From</label>
        <select
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
          className="flex-1 bg-transparent text-white text-sm outline-none"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id} className="bg-gray-900">
              {account.display_name ? `${account.display_name} <${account.email_address}>` : account.email_address}
            </option>
          ))}
        </select>
      </div>

      {/* To */}
      <div className="flex items-start gap-2 px-4 py-2 border-b border-white/10">
        <label className="text-sm text-gray-400 w-14 pt-1">To</label>
        <div className="flex-1 flex flex-wrap items-center gap-1">
          {to.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded text-sm text-white"
            >
              {email}
              <button
                onClick={() => removeRecipient('to', email)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'to', toInput)}
            onPaste={(e) => handlePaste(e, 'to')}
            onBlur={() => toInput && addRecipient('to', toInput)}
            className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none"
            placeholder={to.length === 0 ? 'Recipients' : ''}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="hover:text-white">
              Cc
            </button>
          )}
          {!showBcc && (
            <button onClick={() => setShowBcc(true)} className="hover:text-white">
              Bcc
            </button>
          )}
        </div>
      </div>

      {/* Cc */}
      {showCc && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-white/10">
          <label className="text-sm text-gray-400 w-14 pt-1">Cc</label>
          <div className="flex-1 flex flex-wrap items-center gap-1">
            {cc.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded text-sm text-white"
              >
                {email}
                <button
                  onClick={() => removeRecipient('cc', email)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'cc', ccInput)}
              onPaste={(e) => handlePaste(e, 'cc')}
              onBlur={() => ccInput && addRecipient('cc', ccInput)}
              className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none"
            />
          </div>
        </div>
      )}

      {/* Bcc */}
      {showBcc && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-white/10">
          <label className="text-sm text-gray-400 w-14 pt-1">Bcc</label>
          <div className="flex-1 flex flex-wrap items-center gap-1">
            {bcc.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded text-sm text-white"
              >
                {email}
                <button
                  onClick={() => removeRecipient('bcc', email)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={bccInput}
              onChange={(e) => setBccInput(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'bcc', bccInput)}
              onPaste={(e) => handlePaste(e, 'bcc')}
              onBlur={() => bccInput && addRecipient('bcc', bccInput)}
              className="flex-1 min-w-[150px] bg-transparent text-white text-sm outline-none"
            />
          </div>
        </div>
      )}

      {/* Subject */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <label className="text-sm text-gray-400 w-14">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 bg-transparent text-white text-sm outline-none"
          placeholder="Subject"
        />
      </div>

      {/* Formatting Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10">
        <button
          onClick={() => execCommand('bold')}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => execCommand('italic')}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => execCommand('underline')}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
          title="Underline"
        >
          <Underline className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button
          onClick={() => execCommand('insertUnorderedList')}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            const url = prompt('Enter URL:')
            if (url) execCommand('createLink', url)
          }}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
          title="Insert Link"
        >
          <Link className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-[200px]">
        <div
          ref={bodyRef}
          contentEditable
          className="h-full px-4 py-3 text-white text-sm outline-none prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: body }}
          onInput={() => {}} // Controlled contenteditable
          data-placeholder="Write your message..."
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-white/10">
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg text-sm"
              >
                <Paperclip className="w-4 h-4 text-gray-400" />
                <span className="text-white truncate max-w-[150px]">{file.name}</span>
                <span className="text-gray-500 text-xs">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="text-gray-400 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={sending || to.length === 0}
            className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {sending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send
              </>
            )}
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
            title="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button
            onClick={openPanel}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-yellow-400"
            title="Attach from Documents"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleAttachment}
            className="hidden"
          />
        </div>

        <button
          onClick={handleDiscard}
          className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-red-400"
          title="Discard"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <style jsx>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #6b7280;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
