'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, ArrowRight, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { Lead } from '@/types/database.types'

interface ConvertLeadModalProps {
  lead: Lead
  onClose: () => void
}

export function ConvertLeadModal({ lead, onClose }: ConvertLeadModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    deal_type: 'ira_rollover',
    estimated_value: '',
    ira_type: 'Traditional',
    notes: '',
  })

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    try {
      // 1. Check if contact already exists for this lead
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('lead_id', lead.id)
        .single()

      let contact = existingContact

      // Only create contact if it doesn't exist
      if (!contact) {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            lead_id: lead.id,
            first_name: lead.first_name || 'Unknown',
            last_name: lead.last_name || 'Unknown',
            email: lead.email,
            phone: lead.phone,
            city: lead.city,
            state: lead.state,
            zip_code: lead.zip_code,
            owner_id: lead.owner_id,
          })
          .select()
          .single()

        if (contactError) throw contactError
        contact = newContact
      }

      if (!contact) {
        throw new Error('Failed to create or find contact')
      }

      // 2. Create deal
      const dealName = `${lead.first_name || ''} ${lead.last_name || ''} - ${
        formData.deal_type === 'ira_rollover' ? 'IRA Rollover' :
        formData.deal_type === 'new_ira' ? 'New IRA' :
        formData.deal_type === 'ira_transfer' ? 'IRA Transfer' :
        formData.deal_type === 'cash_purchase' ? 'Cash Purchase' :
        'Investment'
      }`.trim()

      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert({
          name: dealName,
          deal_type: formData.deal_type,
          stage: 'deal_opened',
          contact_id: contact.id,
          lead_id: lead.id,
          owner_id: lead.owner_id!,
          estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
          campaign_id: lead.campaign_id,
          source_type: lead.source_type,
          ira_type: formData.ira_type,
          notes: formData.notes || null,
        })
        .select()
        .single()

      if (dealError) throw dealError

      // 3. Update lead status
      const { error: leadError } = await supabase
        .from('leads')
        .update({
          status: 'converted',
          converted_at: new Date().toISOString(),
          converted_contact_id: contact.id,
          converted_deal_id: deal.id,
        })
        .eq('id', lead.id)

      if (leadError) throw leadError

      setSuccess(true)
      setTimeout(() => {
        onClose()
        router.push(`/dashboard/deals`)
        router.refresh()
      }, 1500)
    } catch (err: unknown) {
      const errorMessage = err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : JSON.stringify(err)
      setError(errorMessage || 'Failed to convert lead')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative glass-card w-full max-w-md mx-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Lead Converted!</h2>
          <p className="text-gray-400">
            The lead has been converted to a contact and deal. Redirecting...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Convert Lead to Deal</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead Info */}
        <div className="p-5 glass-card-subtle mx-5 mt-5 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold">
              {lead.first_name?.[0]}{lead.last_name?.[0]}
            </div>
            <div>
              <p className="text-white font-medium">
                {lead.first_name} {lead.last_name}
              </p>
              <p className="text-gray-400 text-sm">{lead.email || lead.phone}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-yellow-400 ml-auto" />
            <div className="text-right">
              <p className="text-yellow-400 font-medium">New Deal</p>
              <p className="text-gray-400 text-sm">+ Contact</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleConvert} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm">
              {error}
            </div>
          )}

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

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Estimated Value ($)
            </label>
            <input
              type="number"
              value={formData.estimated_value}
              onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
              className="glass-input w-full px-3 py-2"
              placeholder="50000"
              min="0"
              step="1000"
            />
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
              placeholder="Any notes for the deal..."
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
              className="px-6 py-2 glass-button-gold rounded-xl font-medium disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {loading ? (
                'Converting...'
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  Convert to Deal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
