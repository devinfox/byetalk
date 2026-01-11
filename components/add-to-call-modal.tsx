'use client'

import { useState, useEffect } from 'react'
import { X, UserPlus, Phone, Loader2 } from 'lucide-react'

interface Colleague {
  id: string
  first_name: string
  last_name: string
  extension: number | null
  email: string
}

interface AddToCallModalProps {
  isOpen: boolean
  onClose: () => void
  callSid: string | null
  onAddParticipant: (colleague: Colleague) => Promise<void>
}

export function AddToCallModal({
  isOpen,
  onClose,
  callSid,
  onAddParticipant,
}: AddToCallModalProps) {
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchColleagues()
    }
  }, [isOpen])

  const fetchColleagues = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/twilio/add-participant')
      if (!response.ok) {
        throw new Error('Failed to fetch colleagues')
      }
      const data = await response.json()
      setColleagues(data.colleagues || [])
    } catch (err) {
      setError('Failed to load colleagues')
      console.error('[AddToCallModal] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddColleague = async (colleague: Colleague) => {
    if (!callSid || adding) return

    setAdding(colleague.id)
    setError(null)

    try {
      await onAddParticipant(colleague)
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Failed to add colleague')
    } finally {
      setAdding(null)
    }
  }

  const filteredColleagues = colleagues.filter((c) => {
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase()
    const query = searchQuery.toLowerCase()
    return (
      fullName.includes(query) ||
      c.email.toLowerCase().includes(query) ||
      (c.extension && c.extension.toString().includes(query))
    )
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-yellow-400" />
            <h2 className="text-white font-medium">Add to Call</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search colleagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Colleagues List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filteredColleagues.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No colleagues match your search' : 'No colleagues available'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredColleagues.map((colleague) => (
                <button
                  key={colleague.id}
                  onClick={() => handleAddColleague(colleague)}
                  disabled={adding !== null}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-black font-medium">
                    {colleague.first_name[0]}
                    {colleague.last_name[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left">
                    <div className="text-white font-medium">
                      {colleague.first_name} {colleague.last_name}
                    </div>
                    <div className="text-sm text-gray-400">
                      {colleague.extension
                        ? `Ext. ${colleague.extension}`
                        : colleague.email}
                    </div>
                  </div>

                  {/* Add button */}
                  {adding === colleague.id ? (
                    <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                  ) : (
                    <Phone className="w-5 h-5 text-green-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            Select a colleague to add them to your current call
          </p>
        </div>
      </div>
    </div>
  )
}
