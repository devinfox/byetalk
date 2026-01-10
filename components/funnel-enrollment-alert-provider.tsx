"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { useNimbus } from "./nimbus"
import FunnelEnrollmentAlertModal from "./funnel-enrollment-alert-modal"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"

interface EnrollmentAlertData {
  leadName: string
  funnelName: string
  funnelId: string
  matchReason: string
  enrollmentId: string
}

interface FunnelEnrollmentAlertContextType {
  showEnrollmentAlert: (data: EnrollmentAlertData) => void
}

const FunnelEnrollmentAlertContext = createContext<FunnelEnrollmentAlertContextType | null>(null)

export function useFunnelEnrollmentAlert() {
  const context = useContext(FunnelEnrollmentAlertContext)
  if (!context) {
    throw new Error("useFunnelEnrollmentAlert must be used within a FunnelEnrollmentAlertProvider")
  }
  return context
}

// Type for the enrollment record from realtime updates
interface EnrollmentRecord {
  id: string
  funnel_id: string
  lead_id: string | null
  enrolled_by: string | null
  enrolled_at: string
  status: string
}

interface FunnelEnrollmentAlertProviderProps {
  children: React.ReactNode
  userId?: string
}

export function FunnelEnrollmentAlertProvider({
  children,
  userId,
}: FunnelEnrollmentAlertProviderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [alertData, setAlertData] = useState<EnrollmentAlertData | null>(null)
  const [shownEnrollmentIds, setShownEnrollmentIds] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(userId || null)

  const supabase = createClient()
  const { showNimbus } = useNimbus()

  const openModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setTimeout(() => setAlertData(null), 200)
  }, [])

  const handleApprove = useCallback(async () => {
    if (!alertData?.enrollmentId) return

    try {
      const response = await fetch(`/api/email-funnels/enrollments/${alertData.enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })

      if (!response.ok) {
        throw new Error("Failed to approve enrollment")
      }

      showNimbus({
        mood: "happy",
        title: "Approved!",
        message: `${alertData.leadName} is now enrolled in "${alertData.funnelName}"`,
        subMessage: "They'll start receiving the email sequence shortly.",
      })
      handleCloseModal()
    } catch (error) {
      console.error("Error approving enrollment:", error)
      showNimbus({
        mood: "concerned",
        title: "Oops!",
        message: "Failed to approve the enrollment. Please try again.",
      })
    }
  }, [alertData, showNimbus, handleCloseModal])

  const handleReject = useCallback(async () => {
    if (!alertData?.enrollmentId) return

    try {
      const response = await fetch(`/api/email-funnels/enrollments/${alertData.enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })

      if (!response.ok) {
        throw new Error("Failed to reject enrollment")
      }

      showNimbus({
        mood: "talking",
        title: "Got it!",
        message: `${alertData.leadName} won't be enrolled in this funnel.`,
        subMessage: "No emails will be sent.",
      })
      handleCloseModal()
    } catch (error) {
      console.error("Error rejecting enrollment:", error)
      showNimbus({
        mood: "concerned",
        title: "Oops!",
        message: "Failed to reject the enrollment. Please try again.",
      })
    }
  }, [alertData, showNimbus, handleCloseModal])

  const showEnrollmentAlert = useCallback(
    (data: EnrollmentAlertData) => {
      if (shownEnrollmentIds.has(data.enrollmentId)) return

      setShownEnrollmentIds((prev) => new Set([...prev, data.enrollmentId]))
      setAlertData(data)

      showNimbus({
        mood: "happy",
        title: "Funnel Assignment!",
        message: `I've assigned ${data.leadName} to the "${data.funnelName}" email funnel.`,
        subMessage: "Review it, and approve to initiate it!",
        actionLabel: "Review",
        onAction: openModal,
        dismissLabel: "Later",
      })
    },
    [shownEnrollmentIds, showNimbus, openModal]
  )

  // Get current user on mount if not provided
  // IMPORTANT: We need the users.id (not auth.users.id) because enrolled_by stores users.id
  useEffect(() => {
    if (userId) {
      setCurrentUserId(userId)
      return
    }

    async function getCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        // Look up the users table ID from auth_id
        const { data: userProfile } = await supabase
          .from("users")
          .select("id")
          .eq("auth_id", user.id)
          .single()

        if (userProfile) {
          setCurrentUserId(userProfile.id)
        } else {
          // Fallback: try direct ID match (some users might have id = auth_id)
          const { data: directUser } = await supabase
            .from("users")
            .select("id")
            .eq("id", user.id)
            .single()

          if (directUser) {
            setCurrentUserId(directUser.id)
          }
        }
      }
    }
    getCurrentUser()
  }, [supabase, userId])

  // Check for missed pending enrollments (handles race condition on page load)
  const checkMissedEnrollments = useCallback(async () => {
    if (!currentUserId) return

    // Look for pending_approval enrollments created in the last 2 minutes for this user
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    const { data: pendingEnrollments } = await supabase
      .from("email_funnel_enrollments")
      .select(`
        id,
        funnel_id,
        lead_id,
        enrolled_by,
        enrolled_at,
        status
      `)
      .eq("status", "pending_approval")
      .eq("enrolled_by", currentUserId)
      .gte("enrolled_at", twoMinutesAgo)
      .order("enrolled_at", { ascending: false })

    if (!pendingEnrollments || pendingEnrollments.length === 0) return

    // Show alerts for any missed enrollments
    for (const enrollment of pendingEnrollments) {
      if (shownEnrollmentIds.has(enrollment.id)) continue

      // Fetch lead and funnel names
      const [leadResult, funnelResult] = await Promise.all([
        enrollment.lead_id
          ? supabase
              .from("leads")
              .select("first_name, last_name, email")
              .eq("id", enrollment.lead_id)
              .single()
          : Promise.resolve({ data: null }),
        supabase
          .from("email_funnels")
          .select("id, name, tags")
          .eq("id", enrollment.funnel_id)
          .single(),
      ])

      const lead = leadResult.data
      const funnel = funnelResult.data

      if (!funnel) continue

      const leadName = lead
        ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email || "Lead"
        : "Lead"

      showEnrollmentAlert({
        leadName,
        funnelName: funnel.name,
        funnelId: funnel.id,
        matchReason: "AI matched based on call context",
        enrollmentId: enrollment.id,
      })
    }
  }, [currentUserId, supabase, shownEnrollmentIds, showEnrollmentAlert])

  // Subscribe to enrollment inserts
  useEffect(() => {
    if (!currentUserId) return

    // Check for any missed enrollments when subscription is set up
    checkMissedEnrollments()

    const channel = supabase
      .channel("funnel-enrollment-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "email_funnel_enrollments",
        },
        async (payload: RealtimePostgresChangesPayload<EnrollmentRecord>) => {
          const enrollment = payload.new as EnrollmentRecord

          // Only show alerts for pending_approval enrollments made by the current user
          // and that were created recently (within last 30 seconds)
          const enrolledAt = new Date(enrollment.enrolled_at)
          const now = new Date()
          const diffMs = now.getTime() - enrolledAt.getTime()

          if (
            enrollment.status === "pending_approval" &&
            enrollment.enrolled_by === currentUserId &&
            diffMs < 30000 &&
            !shownEnrollmentIds.has(enrollment.id)
          ) {
            // Fetch lead and funnel names
            const [leadResult, funnelResult] = await Promise.all([
              enrollment.lead_id
                ? supabase
                    .from("leads")
                    .select("first_name, last_name, email")
                    .eq("id", enrollment.lead_id)
                    .single()
                : Promise.resolve({ data: null }),
              supabase
                .from("email_funnels")
                .select("id, name, tags")
                .eq("id", enrollment.funnel_id)
                .single(),
            ])

            const lead = leadResult.data
            const funnel = funnelResult.data

            if (!funnel) return

            const leadName = lead
              ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || lead.email || "Lead"
              : "Lead"

            showEnrollmentAlert({
              leadName,
              funnelName: funnel.name,
              funnelId: funnel.id,
              matchReason: "AI matched based on call context",
              enrollmentId: enrollment.id,
            })
          }
        }
      )
      .subscribe((status: string) => {
        console.log("Funnel enrollment alert channel status:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId, shownEnrollmentIds, showEnrollmentAlert, checkMissedEnrollments])

  return (
    <FunnelEnrollmentAlertContext.Provider value={{ showEnrollmentAlert }}>
      {children}
      <FunnelEnrollmentAlertModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        leadName={alertData?.leadName || ""}
        funnelName={alertData?.funnelName || ""}
        funnelId={alertData?.funnelId || ""}
        matchReason={alertData?.matchReason || ""}
        enrollmentId={alertData?.enrollmentId || ""}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </FunnelEnrollmentAlertContext.Provider>
  )
}
