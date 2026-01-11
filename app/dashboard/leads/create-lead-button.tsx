'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import type { User, Campaign } from '@/types/database.types'

interface CreateLeadButtonProps {
  users: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  currentUserId?: string
}

export function CreateLeadButton({ users, campaigns, currentUserId }: CreateLeadButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    source_type: '',
    campaign_id: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          city: formData.city || null,
          state: formData.state || null,
          source_type: formData.source_type || null,
          campaign_id: formData.campaign_id || null,
          owner_id: currentUserId || null,
          notes: formData.notes || null,
          is_ai_generated: false, // Manual lead
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create lead')
      }

      setIsOpen(false)
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        city: '',
        state: '',
        source_type: '',
        campaign_id: '',
        notes: '',
      })
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-5 py-2.5 glass-button-gold rounded-xl text-sm font-medium transition-all hover:scale-105"
      >
        <Plus className="w-4 h-4" />
        Add Lead
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative glass-card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Create New Lead</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="glass-input w-full px-3 py-2"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="glass-input w-full px-3 py-2"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder="New York"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                    State
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="glass-input w-full px-3 py-2"
                    placeholder="NY"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Lead Source
                </label>
                <select
                  value={formData.source_type}
                  onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                  className="glass-select w-full"
                >
                  <option value="">Select source...</option>
                  <option value="ppc">PPC</option>
                  <option value="organic">Organic</option>
                  <option value="referral">Referral</option>
                  <option value="radio">Radio</option>
                  <option value="tv">TV</option>
                  <option value="direct_mail">Direct Mail</option>
                  <option value="inbound_call">Inbound Call</option>
                  <option value="web_form">Web Form</option>
                  <option value="trade_show">Trade Show</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Campaign
                </label>
                <select
                  value={formData.campaign_id}
                  onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value })}
                  className="glass-select w-full"
                >
                  <option value="">Select campaign...</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="glass-input w-full px-3 py-2"
                  placeholder="Any additional notes..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 glass-button-gold rounded-xl font-medium disabled:opacity-50 transition-all"
                >
                  {loading ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
