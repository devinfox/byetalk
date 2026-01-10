"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { useNimbus } from "./nimbus"
import ComplianceAlertModal from "./compliance-alert-modal"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

interface ComplianceWarning {
  severity: string
  category: string
  quote: string
  issue: string
  suggestion: string
}

interface AlertData {
  employeeName: string
  leadName: string
  warnings: ComplianceWarning[]
  callId: string
}

interface ComplianceAlertContextType {
  showAlert: (data: AlertData) => void
}

const ComplianceAlertContext = createContext<ComplianceAlertContextType | null>(null)

export function useComplianceAlert() {
  const context = useContext(ComplianceAlertContext)
  if (!context) {
    throw new Error("useComplianceAlert must be used within a ComplianceAlertProvider")
  }
  return context
}

// Type for the call record from realtime updates
interface CallRecord {
  id: string
  user_id: string
  lead_id: string
  compliance_warnings: ComplianceWarning[] | null
  ai_analysis_status: string
}

export function ComplianceAlertProvider({ children }: { children: React.ReactNode }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [alertData, setAlertData] = useState<AlertData | null>(null)
  const [shownCallIds, setShownCallIds] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const supabase = createClient()
  const { showNimbus } = useNimbus()

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    // Clear alert data after animation
    setTimeout(() => setAlertData(null), 200)
  }, [])

  const showAlert = useCallback((data: AlertData) => {
    // Don't show the same call's warnings twice
    if (shownCallIds.has(data.callId)) return

    setShownCallIds(prev => new Set([...prev, data.callId]))
    setAlertData(data)

    // Get the most severe warning to display
    const primaryWarning = data.warnings.reduce((prev, curr) => {
      const severityOrder = { high: 3, medium: 2, low: 1 }
      const prevScore = severityOrder[prev.severity as keyof typeof severityOrder] || 0
      const currScore = severityOrder[curr.severity as keyof typeof severityOrder] || 0
      return currScore > prevScore ? curr : prev
    }, data.warnings[0])

    const hasHighSeverity = data.warnings.some(w => w.severity === 'high')

    // Show Nimbus with concerned expression for compliance warnings
    showNimbus({
      mood: 'concerned',
      title: `Hey ${data.employeeName}!`,
      message: `Quick heads up about your call with ${data.leadName}. "${primaryWarning.quote.substring(0, 50)}${primaryWarning.quote.length > 50 ? '...' : ''}"`,
      subMessage: hasHighSeverity ? 'This is important - tap to see details.' : 'I have a tip for you!',
      actionLabel: 'View Details',
      onAction: openModal,
      dismissLabel: 'Got it',
    })
  }, [shownCallIds, showNimbus, openModal])

  // Get current user on mount
  useEffect(() => {
    async function getCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    getCurrentUser()
  }, [supabase])

  // Subscribe to call updates
  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel('compliance-alerts')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `user_id=eq.${currentUserId}`,
        },
        async (payload: RealtimePostgresChangesPayload<CallRecord>) => {
          const newCall = payload.new as CallRecord

          // Check if this call was just analyzed and has compliance warnings
          if (
            newCall.ai_analysis_status === 'completed' &&
            newCall.compliance_warnings &&
            newCall.compliance_warnings.length > 0 &&
            !shownCallIds.has(newCall.id)
          ) {
            // Fetch employee and lead names
            const [userResult, leadResult] = await Promise.all([
              supabase
                .from('users')
                .select('first_name, last_name')
                .eq('id', newCall.user_id)
                .single(),
              supabase
                .from('leads')
                .select('first_name, last_name')
                .eq('id', newCall.lead_id)
                .single(),
            ])

            const employeeName = userResult.data
              ? `${userResult.data.first_name || ''} ${userResult.data.last_name || ''}`.trim() || 'there'
              : 'there'

            const leadName = leadResult.data
              ? `${leadResult.data.first_name || ''} ${leadResult.data.last_name || ''}`.trim() || 'the lead'
              : 'the lead'

            showAlert({
              employeeName,
              leadName,
              warnings: newCall.compliance_warnings,
              callId: newCall.id,
            })
          }
        }
      )
      .subscribe((status: string) => {
        console.log('Compliance alert channel status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId, shownCallIds, showAlert])

  return (
    <ComplianceAlertContext.Provider value={{ showAlert }}>
      {children}
      <ComplianceAlertModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        employeeName={alertData?.employeeName || ''}
        leadName={alertData?.leadName || ''}
        warnings={alertData?.warnings || []}
      />
    </ComplianceAlertContext.Provider>
  )
}
