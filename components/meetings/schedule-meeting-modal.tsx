'use client'

import { useState } from 'react'
import { X, Calendar, Clock, Users, Video, Building2, Briefcase, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { format, addHours, setHours, setMinutes } from 'date-fns'

interface ScheduleMeetingModalProps {
  currentUser: {
    id: string
    first_name: string
    last_name: string
  }
  users: Array<{
    id: string
    first_name: string
    last_name: string
    email: string
    avatar_url: string | null
  }>
  leads: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>
  contacts: Array<{ id: string; first_name: string; last_name: string; email: string | null }>
  deals: Array<{ id: string; name: string }>
  onClose: () => void
  onCreated: () => void
}

type MeetingType = 'client' | 'internal'

interface RecurringConfig {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  endDate: string
}

export function ScheduleMeetingModal({
  currentUser,
  users,
  leads,
  contacts,
  deals,
  onClose,
  onCreated,
}: ScheduleMeetingModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default to next hour
  const defaultDate = addHours(new Date(), 1)
  const roundedDate = setMinutes(setHours(defaultDate, defaultDate.getHours()), 0)

  const [meetingType, setMeetingType] = useState<MeetingType>('client')
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([])
  const [recurring, setRecurring] = useState<RecurringConfig>({
    enabled: false,
    frequency: 'weekly',
    endDate: format(addHours(new Date(), 24 * 30), 'yyyy-MM-dd'), // Default 1 month
  })

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: format(roundedDate, 'yyyy-MM-dd'),
    time: format(roundedDate, 'HH:mm'),
    duration_minutes: 30,
    max_participants: 10,
    lead_id: '',
    contact_id: '',
    deal_id: '',
  })

  // Filter out current user from team members list
  const availableTeamMembers = users.filter(u => u.id !== currentUser.id)

  const handleAddTeamMember = (userId: string) => {
    if (userId && !selectedTeamMembers.includes(userId)) {
      setSelectedTeamMembers([...selectedTeamMembers, userId])
    }
  }

  const handleRemoveTeamMember = (userId: string) => {
    setSelectedTeamMembers(selectedTeamMembers.filter(id => id !== userId))
  }

  const getTeamMemberById = (id: string) => users.find(u => u.id === id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Combine date and time
      const scheduledAt = new Date(`${formData.date}T${formData.time}:00`)

      const response = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || undefined,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: formData.duration_minutes,
          max_participants: formData.max_participants,
          meeting_type: meetingType,
          // All features always enabled
          is_public: true,
          recording_enabled: true,
          chat_enabled: true,
          screenshare_enabled: true,
          virtual_bg_enabled: true,
          noise_cancellation_enabled: true,
          // Auto-start recording
          auto_record: true,
          // Screen share requires host approval
          screenshare_requires_approval: true,
          // Link to CRM entities (client meetings only)
          lead_id: meetingType === 'client' ? formData.lead_id || undefined : undefined,
          contact_id: meetingType === 'client' ? formData.contact_id || undefined : undefined,
          deal_id: meetingType === 'client' ? formData.deal_id || undefined : undefined,
          // Team members to invite
          team_member_ids: selectedTeamMembers,
          // Recurring config (internal meetings only)
          recurring: meetingType === 'internal' && recurring.enabled ? {
            frequency: recurring.frequency,
            end_date: recurring.endDate,
          } : undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create meeting')
      }

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-card w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide flex items-center gap-2">
            <Video className="w-5 h-5 text-yellow-400" />
            Schedule Meeting
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Meeting Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">
              Meeting Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMeetingType('client')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  meetingType === 'client'
                    ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
                    : 'border-white/10 hover:border-white/30 text-gray-400'
                }`}
              >
                <Briefcase className="w-6 h-6" />
                <span className="font-medium">Client Meeting</span>
                <span className="text-xs opacity-70">External participants welcome</span>
              </button>
              <button
                type="button"
                onClick={() => setMeetingType('internal')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  meetingType === 'internal'
                    ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
                    : 'border-white/10 hover:border-white/30 text-gray-400'
                }`}
              >
                <Building2 className="w-6 h-6" />
                <span className="font-medium">Internal Meeting</span>
                <span className="text-xs opacity-70">Team members only</span>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Meeting Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="glass-input w-full px-3 py-2"
              placeholder={meetingType === 'client' ? 'Client Discovery Call' : 'Weekly Team Sync'}
              required
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                <Calendar className="w-4 h-4 inline mr-1" />
                Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="glass-input w-full px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                <Clock className="w-4 h-4 inline mr-1" />
                Time *
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="glass-input w-full px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Duration
              </label>
              <select
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                className="glass-select w-full"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          {/* Recurring Meeting (Internal only) */}
          {meetingType === 'internal' && (
            <div className="p-4 glass-card border border-white/10 rounded-xl space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recurring.enabled}
                  onChange={(e) => setRecurring({ ...recurring, enabled: e.target.checked })}
                  className="rounded border-white/20 bg-white/5 text-yellow-500 focus:ring-yellow-500/50"
                />
                <RefreshCw className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-gray-300">Make this a recurring meeting</span>
              </label>

              {recurring.enabled && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                    <select
                      value={recurring.frequency}
                      onChange={(e) => setRecurring({ ...recurring, frequency: e.target.value as RecurringConfig['frequency'] })}
                      className="glass-select w-full text-sm"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every 2 Weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={recurring.endDate}
                      onChange={(e) => setRecurring({ ...recurring, endDate: e.target.value })}
                      className="glass-input w-full px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Description / Agenda
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="glass-input w-full px-3 py-2"
              placeholder="Meeting agenda or notes..."
            />
          </div>

          {/* Invite Team Members */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">
              <Users className="w-4 h-4 inline mr-1" />
              Invite Team Members
            </label>

            {/* Selected Team Members */}
            {selectedTeamMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedTeamMembers.map((memberId) => {
                  const member = getTeamMemberById(memberId)
                  if (!member) return null
                  return (
                    <div
                      key={memberId}
                      className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full text-sm"
                    >
                      <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center text-xs text-yellow-400">
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <span className="text-yellow-400">{member.first_name} {member.last_name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTeamMember(memberId)}
                        className="text-yellow-400/70 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add Team Member Dropdown */}
            <div className="flex gap-2">
              <select
                id="team-member-select"
                className="glass-select flex-1"
                defaultValue=""
                onChange={(e) => {
                  handleAddTeamMember(e.target.value)
                  e.target.value = ''
                }}
              >
                <option value="" disabled>Select team member to add...</option>
                {availableTeamMembers
                  .filter(u => !selectedTeamMembers.includes(u.id))
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} ({user.email})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Link to CRM entities (Client meetings only) */}
          {meetingType === 'client' && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Link to Client Record
              </label>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Lead</label>
                  <select
                    value={formData.lead_id}
                    onChange={(e) => setFormData({ ...formData, lead_id: e.target.value, contact_id: '' })}
                    className="glass-select w-full text-sm"
                  >
                    <option value="">None</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.first_name} {lead.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Contact</label>
                  <select
                    value={formData.contact_id}
                    onChange={(e) => setFormData({ ...formData, contact_id: e.target.value, lead_id: '' })}
                    className="glass-select w-full text-sm"
                  >
                    <option value="">None</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.first_name} {contact.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Deal</label>
                  <select
                    value={formData.deal_id}
                    onChange={(e) => setFormData({ ...formData, deal_id: e.target.value })}
                    className="glass-select w-full text-sm"
                  >
                    <option value="">None</option>
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>
                        {deal.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex gap-3">
              <Video className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300/80">
                <p className="font-medium text-blue-300 mb-1">Meeting Features</p>
                <ul className="space-y-1 text-xs">
                  <li>All meetings are automatically recorded and saved to company storage</li>
                  <li>Screen sharing requires host approval during the call</li>
                  <li>Chat, virtual backgrounds, and noise cancellation are always available</li>
                  <li>Configure your camera and microphone when joining the meeting</li>
                </ul>
              </div>
            </div>
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
              disabled={loading || !formData.title}
              className="px-6 py-2 glass-button-gold rounded-xl font-medium disabled:opacity-50 transition-all"
            >
              {loading ? 'Creating...' : recurring.enabled ? 'Create Recurring Meeting' : 'Create Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
