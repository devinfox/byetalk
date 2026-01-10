'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { User, Lead, Campaign } from '@/types/database.types'

interface CreateDealButtonProps {
  users: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'>[]
  leads: Pick<Lead, 'id' | 'first_name' | 'last_name' | 'email'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
}

export function CreateDealButton({ users, leads, campaigns }: CreateDealButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    deal_type: 'ira_rollover',
    lead_id: '',
    owner_id: '',
    estimated_value: '',
    ira_type: 'Traditional',
    campaign_id: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!formData.name.trim()) {
      setError('Deal name is required')
      setLoading(false)
      return
    }

    if (!formData.owner_id) {
      setError('Owner is required')
      setLoading(false)
      return
    }

    const supabase = createClient()

    const { error: insertError } = await supabase.from('deals').insert({
      name: formData.name.trim(),
      deal_type: formData.deal_type,
      stage: 'deal_opened',
      lead_id: formData.lead_id || null,
      owner_id: formData.owner_id,
      estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
      ira_type: formData.ira_type,
      campaign_id: formData.campaign_id || null,
      notes: formData.notes || null,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    setIsOpen(false)
    setFormData({
      name: '',
      deal_type: 'ira_rollover',
      lead_id: '',
      owner_id: '',
      estimated_value: '',
      ira_type: 'Traditional',
      campaign_id: '',
      notes: '',
    })
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm font-medium transition-all duration-200"
      >
        <Plus className="w-4 h-4" />
        Add Deal
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
              <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Create New Deal</h2>
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

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Deal Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="glass-input w-full"
                  placeholder="John Smith - IRA Rollover"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                    Deal Type
                  </label>
                  <select
                    value={formData.deal_type}
                    onChange={(e) => setFormData({ ...formData, deal_type: e.target.value })}
                    className="glass-select w-full"
                  >
                    <option value="new_ira">New IRA</option>
                    <option value="ira_rollover">IRA Rollover</option>
                    <option value="ira_transfer">IRA Transfer</option>
                    <option value="cash_purchase">Cash Purchase</option>
                    <option value="additional_investment">Additional Investment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                    IRA Type
                  </label>
                  <select
                    value={formData.ira_type}
                    onChange={(e) => setFormData({ ...formData, ira_type: e.target.value })}
                    className="glass-select w-full"
                  >
                    <option value="Traditional">Traditional IRA</option>
                    <option value="Roth">Roth IRA</option>
                    <option value="SEP">SEP IRA</option>
                    <option value="SIMPLE">SIMPLE IRA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Lead
                </label>
                <select
                  value={formData.lead_id}
                  onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                  className="glass-select w-full"
                >
                  <option value="">Select lead...</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.first_name} {lead.last_name} {lead.email ? `(${lead.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Owner *
                </label>
                <select
                  value={formData.owner_id}
                  onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                  className="glass-select w-full"
                  required
                >
                  <option value="">Select owner...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Estimated Value ($)
                </label>
                <input
                  type="number"
                  value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                  className="glass-input w-full"
                  placeholder="50000"
                  min="0"
                  step="1000"
                />
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
                  className="glass-input w-full"
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
                  {loading ? 'Creating...' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
