"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { useNimbus } from "./nimbus"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

interface DraftAlertData {
  draftId: string
  userName: string
  leadName: string
  leadEmail: string
  subject: string
  attachmentNames: string[]
  dueAt: string | null
  commitmentQuote: string | null
}

interface EmailDraftAlertContextType {
  showDraftAlert: (data: DraftAlertData) => void
  openDraftInCompose: (draftId: string) => void
  pendingDraftId: string | null
  clearPendingDraft: () => void
}

const EmailDraftAlertContext = createContext<EmailDraftAlertContextType | null>(null)

export function useEmailDraftAlert() {
  const context = useContext(EmailDraftAlertContext)
  if (!context) {
    throw new Error("useEmailDraftAlert must be used within an EmailDraftAlertProvider")
  }
  return context
}

// Type for the email_drafts record from realtime updates
interface EmailDraftRecord {
  id: string
  user_id: string
  lead_id: string
  to_email: string
  to_name: string | null
  subject: string | null
  attachment_ids: string[] | null
  due_at: string | null
  status: string
  commitment_quote: string | null
}

interface EmailDraftAlertProviderProps {
  children: React.ReactNode
  userId?: string
}

export function EmailDraftAlertProvider({ children, userId }: EmailDraftAlertProviderProps) {
  const [shownDraftIds, setShownDraftIds] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(userId || null)
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null)
  const [currentAlertData, setCurrentAlertData] = useState<DraftAlertData | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const { showNimbus } = useNimbus()

  const openDraftInCompose = useCallback((draftId: string) => {
    setPendingDraftId(draftId)
    // Navigate to email compose with the draft ID
    router.push(`/dashboard/email/compose?draftId=${draftId}`)
  }, [router])

  const clearPendingDraft = useCallback(() => {
    setPendingDraftId(null)
  }, [])

  const handleDismiss = useCallback(async (draftId: string) => {
    // Update draft status to dismissed
    await fetch('/api/email/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft_id: draftId,
        status: 'dismissed'
      })
    })
  }, [])

  const showDraftAlert = useCallback((data: DraftAlertData) => {
    // Don't show the same draft alert twice
    if (shownDraftIds.has(data.draftId)) return

    setShownDraftIds(prev => new Set([...prev, data.draftId]))
    setCurrentAlertData(data)

    // Format due time for display
    const formatDueTime = (isoString: string | null): string => {
      if (!isoString) return ''
      const dueDate = new Date(isoString)
      const now = new Date()
      const diffMs = dueDate.getTime() - now.getTime()
      const diffHours = Math.round(diffMs / (1000 * 60 * 60))
      if (diffHours < 1) {
        const diffMins = Math.round(diffMs / (1000 * 60))
        if (diffMins <= 0) return 'now'
        return `${diffMins} minute${diffMins === 1 ? '' : 's'}`
      }
      if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'}`
      }
      return dueDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    }

    // Build the message
    let message = `I've drafted an email to ${data.leadName}`
    if (data.attachmentNames.length > 0) {
      const attachmentText = data.attachmentNames.length === 1
        ? data.attachmentNames[0]
        : `${data.attachmentNames.length} documents`
      message += ` and attached ${attachmentText}`
    }
    message += '.'

    const dueTimeDisplay = data.dueAt ? formatDueTime(data.dueAt) : null
    const subMessage = dueTimeDisplay ? `Send before ${dueTimeDisplay}!` : 'Review it when you get a chance!'

    showNimbus({
      mood: 'happy',
      title: `Hey ${data.userName}!`,
      message,
      subMessage,
      actionLabel: 'Review Draft',
      onAction: () => openDraftInCompose(data.draftId),
      dismissLabel: 'Dismiss',
      onDismiss: () => handleDismiss(data.draftId),
    })
  }, [shownDraftIds, showNimbus, openDraftInCompose, handleDismiss])

  // Get current user on mount if not provided
  useEffect(() => {
    if (userId) {
      setCurrentUserId(userId)
      return
    }

    async function getCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    getCurrentUser()
  }, [supabase, userId])

  // Subscribe to email_drafts inserts
  useEffect(() => {
    if (!currentUserId) return

    console.log('[EmailDraftAlert] Setting up realtime subscription for user:', currentUserId)

    const channel = supabase
      .channel('email-draft-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_drafts',
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload: RealtimePostgresChangesPayload<EmailDraftRecord>) => {
          console.log('[EmailDraftAlert] Received realtime event:', payload)
          const newDraft = payload.new as EmailDraftRecord

          // Only show alert for pending AI-generated drafts
          if (newDraft.status !== 'pending' || shownDraftIds.has(newDraft.id)) {
            console.log('[EmailDraftAlert] Skipping - status:', newDraft.status, 'alreadyShown:', shownDraftIds.has(newDraft.id))
            return
          }

          // Fetch user name
          const { data: userProfile } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('id', newDraft.user_id)
            .single()

          const userName = userProfile
            ? `${userProfile.first_name || ''}`.trim() || 'there'
            : 'there'

          // Fetch attachment names if any
          let attachmentNames: string[] = []
          if (newDraft.attachment_ids && newDraft.attachment_ids.length > 0) {
            const { data: docs } = await supabase
              .from('documents')
              .select('file_name')
              .in('id', newDraft.attachment_ids)

            attachmentNames = docs?.map(d => d.file_name) || []
          }

          showDraftAlert({
            draftId: newDraft.id,
            userName,
            leadName: newDraft.to_name || 'the lead',
            leadEmail: newDraft.to_email,
            subject: newDraft.subject || '(no subject)',
            attachmentNames,
            dueAt: newDraft.due_at,
            commitmentQuote: newDraft.commitment_quote
          })
        }
      )
      .subscribe((status: string, err?: Error) => {
        console.log('[EmailDraftAlert] Channel status:', status, err ? `Error: ${err.message}` : '')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId, shownDraftIds, showDraftAlert])

  return (
    <EmailDraftAlertContext.Provider value={{
      showDraftAlert,
      openDraftInCompose,
      pendingDraftId,
      clearPendingDraft
    }}>
      {children}
    </EmailDraftAlertContext.Provider>
  )
}
