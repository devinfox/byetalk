"use client"

import { X, Mail, Paperclip, Clock } from "lucide-react"

interface EmailDraftAlertModalProps {
  isOpen: boolean
  onClose: () => void
  onReview: () => void
  onDismiss: () => void
  userName: string
  leadName: string
  subject: string
  attachmentNames: string[]
  dueAt: string | null
}

export function EmailDraftAlertModal({
  isOpen,
  onClose,
  onReview,
  onDismiss,
  userName,
  leadName,
  subject,
  attachmentNames,
  dueAt,
}: EmailDraftAlertModalProps) {
  if (!isOpen) return null

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

    // Format as time
    return dueDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const dueTimeDisplay = dueAt ? formatDueTime(dueAt) : null

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
          <div
            className="px-6 py-4 border-b border-white/10"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(218, 165, 32, 0.15) 50%, rgba(184, 134, 11, 0.15) 100%)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-yellow-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Email Ready!</h2>
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
              Hey <span className="text-yellow-400 font-medium">{userName}</span>!
            </p>

            <p className="text-gray-300 leading-relaxed">
              I&apos;ve gone ahead and drafted an email to{' '}
              <span className="text-blue-400 font-medium">{leadName}</span>
              {attachmentNames.length > 0 && (
                <>
                  {' '}and attached{' '}
                  <span className="text-green-400 font-medium">
                    {attachmentNames.length === 1
                      ? attachmentNames[0]
                      : `${attachmentNames.length} documents`}
                  </span>
                </>
              )}.
            </p>

            {/* Email Preview */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-400">Subject:</p>
                  <p className="text-white font-medium truncate">{subject}</p>
                </div>
              </div>

              {attachmentNames.length > 0 && (
                <div className="flex items-start gap-3 mt-3 pt-3 border-t border-white/10">
                  <Paperclip className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-400">Attachments:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {attachmentNames.map((name, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Due time reminder */}
            {dueTimeDisplay && (
              <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">
                  Send before <span className="font-medium">{dueTimeDisplay}</span>
                </span>
              </div>
            )}

            <p className="text-gray-400 text-sm">
              Read it over and make sure it sounds good before sending!
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-gray-300 font-medium rounded-xl transition-all duration-200"
            >
              Dismiss
            </button>
            <button
              onClick={onReview}
              className="flex-1 py-3 font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] text-black"
              style={{
                background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
              }}
            >
              Review Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
