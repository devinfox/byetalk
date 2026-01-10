'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { Lead, User, Campaign } from '@/types/database.types'

interface EditLeadModalProps {
  lead: Lead & {
    owner: { id: string; first_name: string; last_name: string } | null
    campaign: { id: string; name: string; code: string | null } | null
  }
  users: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  onClose: () => void
}

export function EditLeadModal({ lead, users, campaigns, onClose }: EditLeadModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    city: lead.city || '',
    state: lead.state || '',
    source_type: lead.source_type || '',
    campaign_id: lead.campaign_id || '',
    owner_id: lead.owner_id || '',
    notes: lead.notes || '',
    status: lead.status,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        email: formData.email || null,
        phone: formData.phone || null,
        city: formData.city || null,
        state: formData.state || null,
        source_type: formData.source_type || null,
        campaign_id: formData.campaign_id || null,
        owner_id: formData.owner_id || null,
        notes: formData.notes || null,
        status: formData.status,
      })
      .eq('id', lead.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    onClose()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Edit Lead</h2>
          <button
            onClick={onClose}
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
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as Lead['status'] })}
              className="glass-select w-full"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="unqualified">Unqualified</option>
              <option value="converted">Converted</option>
              <option value="dead">Dead</option>
            </select>
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
              Assign To
            </label>
            <select
              value={formData.owner_id}
              onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
              className="glass-select w-full"
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.first_name} {user.last_name}
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
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 glass-button-gold rounded-xl font-medium disabled:opacity-50 transition-all"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
