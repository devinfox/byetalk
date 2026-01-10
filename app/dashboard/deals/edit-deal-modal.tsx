'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { Deal, User, Campaign, DealStage, DealType } from '@/types/database.types'

interface DealWithRelations extends Deal {
  owner: { id: string; first_name: string; last_name: string } | null
  campaign: { id: string; name: string; code: string | null } | null
}

interface EditDealModalProps {
  deal: DealWithRelations
  users: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  onClose: () => void
}

const STAGES: { key: DealStage; label: string }[] = [
  { key: 'deal_opened', label: 'Deal Opened' },
  { key: 'proposal_education', label: 'Proposal / Education' },
  { key: 'paperwork_sent', label: 'Paperwork Sent' },
  { key: 'paperwork_complete', label: 'Paperwork Complete' },
  { key: 'funding_in_progress', label: 'Funding In Progress' },
  { key: 'closed_won', label: 'Closed - Won' },
  { key: 'closed_lost', label: 'Closed - Lost' },
]

export function EditDealModal({ deal, users, campaigns, onClose }: EditDealModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: deal.name || '',
    deal_type: deal.deal_type,
    stage: deal.stage,
    owner_id: deal.owner_id || '',
    estimated_value: deal.estimated_value?.toString() || '',
    funded_amount: deal.funded_amount?.toString() || '',
    ira_type: deal.ira_type || 'Traditional',
    campaign_id: deal.campaign_id || '',
    notes: deal.notes || '',
    lost_reason: deal.lost_reason || '',
    lost_reason_notes: deal.lost_reason_notes || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    const updateData: Record<string, unknown> = {
      name: formData.name || null,
      deal_type: formData.deal_type,
      stage: formData.stage,
      owner_id: formData.owner_id,
      estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
      funded_amount: formData.funded_amount ? parseFloat(formData.funded_amount) : 0,
      ira_type: formData.ira_type,
      campaign_id: formData.campaign_id || null,
      notes: formData.notes || null,
    }

    // If stage changed, update stage_entered_at
    if (formData.stage !== deal.stage) {
      updateData.stage_entered_at = new Date().toISOString()

      // Handle closed stages
      if (formData.stage === 'closed_won') {
        updateData.closed_at = new Date().toISOString()
      } else if (formData.stage === 'closed_lost') {
        updateData.closed_lost_at = new Date().toISOString()
        updateData.lost_reason = formData.lost_reason || null
        updateData.lost_reason_notes = formData.lost_reason_notes || null
      }
    }

    const { error: updateError } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', deal.id)

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
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Edit Deal</h2>
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

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Deal Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="glass-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Deal Type
              </label>
              <select
                value={formData.deal_type}
                onChange={(e) => setFormData({ ...formData, deal_type: e.target.value as DealType })}
                className="glass-select w-full"
              >
                <option value="new_ira">New IRA</option>
                <option value="ira_rollover">IRA Rollover</option>
                <option value="ira_transfer">IRA Transfer</option>
                <option value="cash_purchase">Cash Purchase</option>
                <option value="additional_investment">Additional Investment</option>
                <option value="liquidation">Liquidation</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Stage
              </label>
              <select
                value={formData.stage}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value as DealStage })}
                className="glass-select w-full"
              >
                {STAGES.map((stage) => (
                  <option key={stage.key} value={stage.key}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formData.stage === 'closed_lost' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Lost Reason
                </label>
                <select
                  value={formData.lost_reason}
                  onChange={(e) => setFormData({ ...formData, lost_reason: e.target.value })}
                  className="glass-select w-full"
                >
                  <option value="">Select reason...</option>
                  <option value="price">Price/Fees</option>
                  <option value="competitor">Went with Competitor</option>
                  <option value="timing">Bad Timing</option>
                  <option value="no_response">No Response</option>
                  <option value="changed_mind">Changed Mind</option>
                  <option value="not_qualified">Not Qualified</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Lost Reason Notes
                </label>
                <textarea
                  value={formData.lost_reason_notes}
                  onChange={(e) => setFormData({ ...formData, lost_reason_notes: e.target.value })}
                  rows={2}
                  className="glass-input w-full"
                  placeholder="Additional details..."
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Owner
            </label>
            <select
              value={formData.owner_id}
              onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
              className="glass-select w-full"
            >
              <option value="">Select owner...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.first_name} {user.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Estimated Value ($)
              </label>
              <input
                type="number"
                value={formData.estimated_value}
                onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                className="glass-input w-full"
                min="0"
                step="1000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Funded Amount ($)
              </label>
              <input
                type="number"
                value={formData.funded_amount}
                onChange={(e) => setFormData({ ...formData, funded_amount: e.target.value })}
                className="glass-input w-full"
                min="0"
                step="1000"
              />
            </div>
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
