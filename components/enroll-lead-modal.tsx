'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Users, Check, AlertCircle, Loader2 } from 'lucide-react'

interface Funnel {
  id: string
  name: string
  description: string | null
  status: string
  total_enrolled: number
  phases?: Array<{
    id: string
    name: string | null
    phase_order: number
  }>
}

interface EnrollLeadModalProps {
  leadId: string
  leadName: string
  leadEmail: string | null
  onClose: () => void
  onSuccess: () => void
}

export function EnrollLeadModal({
  leadId,
  leadName,
  leadEmail,
  onClose,
  onSuccess,
}: EnrollLeadModalProps) {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch active funnels
  useEffect(() => {
    async function fetchFunnels() {
      try {
        const response = await fetch('/api/email-funnels')
        const result = await response.json()

        if (!response.ok) {
          setError(result.error || 'Failed to load funnels')
          return
        }

        // Filter to only active funnels
        const activeFunnels = (result.data || []).filter(
          (f: Funnel) => f.status === 'active'
        )
        setFunnels(activeFunnels)
      } catch (err) {
        console.error('Error fetching funnels:', err)
        setError('Failed to load funnels')
      } finally {
        setLoading(false)
      }
    }

    fetchFunnels()
  }, [])

  const handleEnroll = async () => {
    if (!selectedFunnelId) {
      setError('Please select a campaign')
      return
    }

    if (!leadEmail) {
      setError('Lead has no email address. Cannot enroll in email campaign.')
      return
    }

    setEnrolling(true)
    setError(null)

    try {
      const response = await fetch('/api/email-funnels/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnel_id: selectedFunnelId,
          lead_ids: [leadId],
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to enroll lead')
        return
      }

      if (result.enrolled > 0) {
        setSuccessMessage(`${leadName} has been enrolled in the campaign!`)
        setTimeout(() => {
          onSuccess()
        }, 1500)
      } else {
        setError(result.message || 'Lead is already enrolled in this campaign')
      }
    } catch (err) {
      console.error('Error enrolling lead:', err)
      setError('Network error. Please try again.')
    } finally {
      setEnrolling(false)
    }
  }

  const selectedFunnel = funnels.find((f) => f.id === selectedFunnelId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md glass-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Enroll in Campaign</h2>
              <p className="text-sm text-gray-400">{leadName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Success Message */}
          {successMessage && (
            <div className="flex items-center gap-3 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-green-300">{successMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{error}</span>
            </div>
          )}

          {/* No Email Warning */}
          {!leadEmail && (
            <div className="flex items-center gap-3 p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-300">
                This lead has no email address and cannot be enrolled in email campaigns.
              </span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
            </div>
          )}

          {/* Funnel Selection */}
          {!loading && !successMessage && leadEmail && (
            <>
              {funnels.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400">No active campaigns available</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Create and activate a campaign first
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-300">
                    Select Campaign
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {funnels.map((funnel) => (
                      <button
                        key={funnel.id}
                        onClick={() => setSelectedFunnelId(funnel.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          selectedFunnelId === funnel.id
                            ? 'border-yellow-500/50 bg-yellow-500/10'
                            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-white">{funnel.name}</h3>
                            {funnel.description && (
                              <p className="text-sm text-gray-400 mt-0.5">
                                {funnel.description}
                              </p>
                            )}
                          </div>
                          {selectedFunnelId === funnel.id && (
                            <Check className="w-5 h-5 text-yellow-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>{funnel.phases?.length || 0} phases</span>
                          <span>{funnel.total_enrolled} enrolled</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedFunnel && (
                    <div className="p-3 bg-white/5 rounded-lg text-sm text-gray-400">
                      <strong className="text-white">Note:</strong> {leadName} will start
                      receiving emails from this campaign immediately.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!successMessage && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleEnroll}
              disabled={enrolling || !selectedFunnelId || !leadEmail}
              className="px-6 py-2 glass-button-gold rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {enrolling && <Loader2 className="w-4 h-4 animate-spin" />}
              {enrolling ? 'Enrolling...' : 'Enroll in Campaign'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
