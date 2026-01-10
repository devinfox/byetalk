"use client"

import { X } from "lucide-react"

interface ComplianceWarning {
  severity: string
  category: string
  quote: string
  issue: string
  suggestion: string
}

interface ComplianceAlertModalProps {
  isOpen: boolean
  onClose: () => void
  employeeName: string
  leadName: string
  warnings: ComplianceWarning[]
}

export default function ComplianceAlertModal({
  isOpen,
  onClose,
  employeeName,
  leadName,
  warnings,
}: ComplianceAlertModalProps) {
  if (!isOpen || warnings.length === 0) return null

  // Get the most severe warning to highlight
  const primaryWarning = warnings.reduce((prev, curr) => {
    const severityOrder = { high: 3, medium: 2, low: 1 }
    const prevScore = severityOrder[prev.severity as keyof typeof severityOrder] || 0
    const currScore = severityOrder[curr.severity as keyof typeof severityOrder] || 0
    return currScore > prevScore ? curr : prev
  }, warnings[0])

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
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">💡</span>
                <h2 className="text-xl font-semibold text-white">Quick Coaching Tip</h2>
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
            {/* Friendly greeting */}
            <p className="text-gray-200 text-lg leading-relaxed">
              Hey <span className="text-yellow-400 font-medium">{employeeName}</span>! 👋
            </p>

            <p className="text-gray-300 leading-relaxed">
              I know it gets exciting talking about investing, but it&apos;s important we don&apos;t promise things we can&apos;t guarantee.
            </p>

            {/* The issue */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-gray-300 text-sm mb-2">
                It looks like you told <span className="text-blue-400 font-medium">{leadName}</span>:
              </p>
              <p className="text-white italic text-base">
                &ldquo;{primaryWarning.quote}&rdquo;
              </p>
            </div>

            {/* Why it matters */}
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-gray-400 text-sm mb-1 font-medium uppercase tracking-wide">Why this matters:</p>
              <p className="text-gray-300 text-sm">{primaryWarning.issue}</p>
            </div>

            {/* Better alternative */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <p className="text-green-400 text-sm mb-1 font-medium">✓ Try saying something like:</p>
              <p className="text-gray-200 text-sm">&ldquo;{primaryWarning.suggestion}&rdquo;</p>
            </div>

            {/* Additional warnings count */}
            {warnings.length > 1 && (
              <p className="text-gray-500 text-sm text-center">
                + {warnings.length - 1} other {warnings.length - 1 === 1 ? 'tip' : 'tips'} from this call
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white/5 border-t border-white/10">
            <button
              onClick={onClose}
              className="w-full py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02]"
            >
              Got it, thanks! 👍
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
