"use client"

import { useState } from "react"
import { X, Mail, Sparkles, ArrowRight, Check, XIcon } from "lucide-react"
import Link from "next/link"

interface FunnelEnrollmentAlertModalProps {
  isOpen: boolean
  onClose: () => void
  leadName: string
  funnelName: string
  funnelId: string
  matchReason: string
  enrollmentId: string
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
}

export default function FunnelEnrollmentAlertModal({
  isOpen,
  onClose,
  leadName,
  funnelName,
  funnelId,
  matchReason,
  enrollmentId,
  onApprove,
  onReject,
}: FunnelEnrollmentAlertModalProps) {
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  if (!isOpen) return null

  const handleApprove = async () => {
    setApproving(true)
    await onApprove()
    setApproving(false)
  }

  const handleReject = async () => {
    setRejecting(true)
    await onReject()
    setRejecting(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200">
        <div className="glass-card border border-yellow-500/30 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="w-6 h-6 text-yellow-400" />
                <h2 className="text-xl font-semibold text-white">Review Funnel Draft</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-4">
            {/* Main message */}
            <div className="text-center">
              <p className="text-gray-300 text-base leading-relaxed">
                I&apos;ve gone ahead and enrolled
              </p>
              <p className="text-xl font-semibold text-yellow-400 mt-1">
                {leadName}
              </p>
              <p className="text-gray-300 text-base mt-1">
                into the
              </p>
              <p className="text-2xl font-bold text-white mt-2">
                &ldquo;{funnelName}&rdquo;
              </p>
              <p className="text-gray-400 text-sm mt-1">funnel</p>
            </div>

            {/* AI Match Reason */}
            {matchReason && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-purple-400 text-sm mb-2">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium">AI Match Reason</span>
                </div>
                <p className="text-gray-300 text-sm">
                  {matchReason}
                </p>
              </div>
            )}

            {/* Pending status notice */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-amber-400 text-sm">
                Take a look and make sure it makes sense! The lead won&apos;t receive any emails until you approve.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white/5 border-t border-white/10 space-y-3">
            {/* Primary actions */}
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={approving || rejecting}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
                {approving ? "Approving..." : "Approve"}
              </button>
              <button
                onClick={handleReject}
                disabled={approving || rejecting}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-50"
              >
                <XIcon className="w-5 h-5" />
                {rejecting ? "Rejecting..." : "Reject"}
              </button>
            </div>

            {/* Secondary actions */}
            <div className="flex gap-3">
              <Link
                href={`/dashboard/email-templates/funnels/${funnelId}`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm"
                onClick={onClose}
              >
                View Funnel
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/email-templates?tab=drafts"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm"
                onClick={onClose}
              >
                View All Drafts
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
