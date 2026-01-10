'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Tag, Users, Check, AlertCircle, Loader2, Search } from 'lucide-react'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  ai_tags: Array<{ label: string; category: string }> | null
  already_enrolled: boolean
}

interface ImportLeadsByTagsModalProps {
  funnelId: string
  funnelName: string
  onClose: () => void
  onSuccess: (enrolledCount: number) => void
}

// Common tag categories and their colors
const tagCategoryColors: Record<string, { bg: string; text: string; border: string }> = {
  investment: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  budget: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  personality: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  situation: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  relationship: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  motivation: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  timeline: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

export function ImportLeadsByTagsModal({
  funnelId,
  funnelName,
  onClose,
  onSuccess,
}: ImportLeadsByTagsModalProps) {
  const [tagSearch, setTagSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [matchingLeads, setMatchingLeads] = useState<Lead[]>([])
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<Array<{ label: string; category: string; count: number }>>([])

  // Fetch all unique tags from leads
  useEffect(() => {
    async function fetchAllTags() {
      setLoading(true)
      try {
        const response = await fetch('/api/leads/tags')
        const result = await response.json()

        if (response.ok && result.data) {
          setAllTags(result.data)
        }
      } catch (err) {
        console.error('Error fetching tags:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAllTags()
  }, [])

  // Search for leads when tags are selected
  const searchLeads = useCallback(async () => {
    if (selectedTags.length === 0) {
      setMatchingLeads([])
      return
    }

    setSearching(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('tags', selectedTags.join(','))
      params.set('funnel_id', funnelId)

      const response = await fetch(`/api/email-funnels/enroll?${params.toString()}`)
      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to search leads')
        return
      }

      setMatchingLeads(result.data || [])
      // Auto-select leads that have email and aren't already enrolled
      const eligibleLeadIds = (result.data || [])
        .filter((l: Lead) => l.email && !l.already_enrolled)
        .map((l: Lead) => l.id)
      setSelectedLeadIds(eligibleLeadIds)
    } catch (err) {
      console.error('Error searching leads:', err)
      setError('Network error. Please try again.')
    } finally {
      setSearching(false)
    }
  }, [selectedTags, funnelId])

  // Auto-search when tags change
  useEffect(() => {
    const debounce = setTimeout(() => {
      searchLeads()
    }, 300)

    return () => clearTimeout(debounce)
  }, [searchLeads])

  const toggleTag = (tagLabel: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagLabel)
        ? prev.filter((t) => t !== tagLabel)
        : [...prev, tagLabel]
    )
  }

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    )
  }

  const selectAllEligible = () => {
    const eligibleIds = matchingLeads
      .filter((l) => l.email && !l.already_enrolled)
      .map((l) => l.id)
    setSelectedLeadIds(eligibleIds)
  }

  const deselectAll = () => {
    setSelectedLeadIds([])
  }

  const handleEnroll = async () => {
    if (selectedLeadIds.length === 0) {
      setError('Please select at least one lead')
      return
    }

    setEnrolling(true)
    setError(null)

    try {
      const response = await fetch('/api/email-funnels/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funnel_id: funnelId,
          lead_ids: selectedLeadIds,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to enroll leads')
        return
      }

      if (result.enrolled > 0) {
        setSuccessMessage(
          `Successfully enrolled ${result.enrolled} lead${result.enrolled > 1 ? 's' : ''} in ${funnelName}!`
        )
        setTimeout(() => {
          onSuccess(result.enrolled)
        }, 1500)
      } else {
        setError(result.message || 'No leads were enrolled')
      }
    } catch (err) {
      console.error('Error enrolling leads:', err)
      setError('Network error. Please try again.')
    } finally {
      setEnrolling(false)
    }
  }

  const filteredTags = tagSearch
    ? allTags.filter(
        (t) =>
          t.label.toLowerCase().includes(tagSearch.toLowerCase()) ||
          t.category.toLowerCase().includes(tagSearch.toLowerCase())
      )
    : allTags

  const eligibleCount = matchingLeads.filter((l) => l.email && !l.already_enrolled).length
  const alreadyEnrolledCount = matchingLeads.filter((l) => l.already_enrolled).length
  const noEmailCount = matchingLeads.filter((l) => !l.email).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden glass-card rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Tag className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Import Leads by Tags</h2>
              <p className="text-sm text-gray-400">{funnelName}</p>
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
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
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

          {!successMessage && (
            <>
              {/* Tag Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  1. Select Tags to Match
                </label>

                {/* Tag Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags..."
                    className="glass-input w-full pl-10 pr-4 py-2"
                  />
                </div>

                {/* Tags Grid */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                    {filteredTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.label)
                      const colors = tagCategoryColors[tag.category] || tagCategoryColors.investment

                      return (
                        <button
                          key={`${tag.category}-${tag.label}`}
                          onClick={() => toggleTag(tag.label)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
                            isSelected
                              ? 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300'
                              : `${colors.bg} border ${colors.border} ${colors.text} hover:opacity-80`
                          } border`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          {tag.label}
                          <span className="text-xs opacity-60">({tag.count})</span>
                        </button>
                      )
                    })}
                    {filteredTags.length === 0 && (
                      <p className="text-gray-500 text-sm">No tags found</p>
                    )}
                  </div>
                )}

                {selectedTags.length > 0 && (
                  <p className="text-sm text-gray-400 mt-2">
                    {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* Matching Leads */}
              {selectedTags.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-300">
                      2. Select Leads to Enroll
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectAllEligible}
                        className="text-xs text-yellow-400 hover:text-yellow-300"
                      >
                        Select All
                      </button>
                      <span className="text-gray-600">|</span>
                      <button
                        onClick={deselectAll}
                        className="text-xs text-gray-400 hover:text-gray-300"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {searching ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
                    </div>
                  ) : matchingLeads.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                      <p className="text-gray-400">No leads match the selected tags</p>
                    </div>
                  ) : (
                    <>
                      {/* Stats */}
                      <div className="flex items-center gap-4 mb-3 text-xs">
                        <span className="text-green-400">{eligibleCount} eligible</span>
                        {alreadyEnrolledCount > 0 && (
                          <span className="text-gray-500">
                            {alreadyEnrolledCount} already enrolled
                          </span>
                        )}
                        {noEmailCount > 0 && (
                          <span className="text-yellow-500">{noEmailCount} no email</span>
                        )}
                      </div>

                      {/* Leads List */}
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {matchingLeads.map((lead) => {
                          const isSelected = selectedLeadIds.includes(lead.id)
                          const isEligible = lead.email && !lead.already_enrolled

                          return (
                            <button
                              key={lead.id}
                              onClick={() => isEligible && toggleLead(lead.id)}
                              disabled={!isEligible}
                              className={`w-full text-left p-3 rounded-lg border transition-all ${
                                !isEligible
                                  ? 'opacity-50 cursor-not-allowed border-white/5 bg-white/5'
                                  : isSelected
                                  ? 'border-yellow-500/50 bg-yellow-500/10'
                                  : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isEligible && (
                                    <div
                                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                                        isSelected
                                          ? 'bg-yellow-500 border-yellow-500'
                                          : 'border-gray-500'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-3 h-3 text-black" />}
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-medium text-white">
                                      {lead.first_name} {lead.last_name}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                      {lead.email || 'No email'}
                                    </p>
                                  </div>
                                </div>
                                {lead.already_enrolled && (
                                  <span className="text-xs text-gray-500 px-2 py-1 bg-gray-500/20 rounded">
                                    Already enrolled
                                  </span>
                                )}
                                {!lead.email && (
                                  <span className="text-xs text-yellow-500 px-2 py-1 bg-yellow-500/20 rounded">
                                    No email
                                  </span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!successMessage && (
          <div className="flex items-center justify-between p-4 border-t border-white/10">
            <p className="text-sm text-gray-400">
              {selectedLeadIds.length > 0
                ? `${selectedLeadIds.length} lead${selectedLeadIds.length > 1 ? 's' : ''} selected`
                : 'Select tags to find matching leads'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleEnroll}
                disabled={enrolling || selectedLeadIds.length === 0}
                className="px-6 py-2 glass-button-gold rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {enrolling && <Loader2 className="w-4 h-4 animate-spin" />}
                {enrolling ? 'Enrolling...' : `Enroll ${selectedLeadIds.length} Leads`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
