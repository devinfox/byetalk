'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CallButton } from '@/components/call-button'
import {
  Phone,
  Mail,
  MoreHorizontal,
  UserPlus,
  ArrowRightCircle,
  Pencil,
  Trash2,
  Search,
  Filter,
  Zap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Switch } from '@/components/ui/switch'
import { EditLeadModal } from './edit-lead-modal'
import { ConvertLeadModal } from './convert-lead-modal'
import type { Lead, User, Campaign } from '@/types/database.types'

interface LeadsTableProps {
  leads: (Lead & {
    owner: { id: string; first_name: string; last_name: string } | null
    campaign: { id: string; name: string; code: string | null } | null
  })[]
  users: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  currentUser: User | null
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  contacted: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  qualified: 'bg-green-500/10 text-green-400 border-green-500/20',
  unqualified: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  converted: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  dead: 'bg-red-500/10 text-red-400 border-red-500/20',
}

export function LeadsTable({ leads, users, campaigns, currentUser }: LeadsTableProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [editingLead, setEditingLead] = useState<typeof leads[0] | null>(null)
  const [convertingLead, setConvertingLead] = useState<typeof leads[0] | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Turbo mode queue state - using Record for reliable React state updates
  const [turboQueueLeadIds, setTurboQueueLeadIds] = useState<Record<string, boolean>>({})
  const [turboLoading, setTurboLoading] = useState<Record<string, boolean>>({})

  // Fetch turbo queue status
  const fetchTurboQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/turbo/queue')
      if (response.ok) {
        const data = await response.json()
        const queuedLeadIds: Record<string, boolean> = {}
        for (const item of data.queue?.items || []) {
          queuedLeadIds[item.lead_id] = true
        }
        setTurboQueueLeadIds(queuedLeadIds)
      }
    } catch (error) {
      console.error('Error fetching turbo queue:', error)
    }
  }, [])

  useEffect(() => {
    fetchTurboQueue()
  }, [fetchTurboQueue])

  // Toggle turbo mode for a lead
  const toggleTurboMode = async (leadId: string, shouldEnable: boolean) => {
    // Set loading state for this specific lead
    setTurboLoading(prev => ({ ...prev, [leadId]: true }))

    try {
      if (!shouldEnable) {
        // Remove from queue
        const response = await fetch(`/api/turbo/queue?lead_id=${leadId}`, {
          method: 'DELETE',
        })
        if (response.ok) {
          setTurboQueueLeadIds(prev => {
            const next = { ...prev }
            delete next[leadId]
            return next
          })
        } else {
          console.error('Failed to remove from turbo queue:', await response.text())
          // Refetch to get correct state
          await fetchTurboQueue()
        }
      } else {
        // Add to queue
        const response = await fetch('/api/turbo/queue/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: [leadId] }),
        })
        if (response.ok) {
          setTurboQueueLeadIds(prev => ({ ...prev, [leadId]: true }))
        } else {
          console.error('Failed to add to turbo queue:', await response.text())
          // Refetch to get correct state
          await fetchTurboQueue()
        }
      }
    } catch (error) {
      console.error('Error toggling turbo mode:', error)
      // Refetch on error to ensure state is correct
      await fetchTurboQueue()
    } finally {
      setTurboLoading(prev => {
        const next = { ...prev }
        delete next[leadId]
        return next
      })
    }
  }

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch =
      searchQuery === '' ||
      `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery)

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleAssign = async (leadId: string, userId: string) => {
    const supabase = createClient()
    await supabase
      .from('leads')
      .update({
        owner_id: userId,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    router.refresh()
    setOpenMenuId(null)
  }

  const handleStatusChange = async (leadId: string, status: string) => {
    const supabase = createClient()
    await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)

    router.refresh()
  }

  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (leadId: string, leadName: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${leadName}"?\n\nThis action cannot be undone. All associated data will be unlinked.`)) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        alert(`Failed to delete lead: ${data.error || 'Unknown error'}`)
        return
      }

      router.refresh()
    } catch (error) {
      console.error('Error deleting lead:', error)
      alert('Failed to delete lead. Please try again.')
    } finally {
      setIsDeleting(false)
      setOpenMenuId(null)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <>
      <div className="glass-card">
        {/* Filters */}
        <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-10 pr-4"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-yellow-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-select"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="unqualified">Unqualified</option>
              <option value="converted">Converted</option>
              <option value="dead">Dead</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wider border-b border-white/10">
                <th className="px-5 py-4 font-medium">Lead</th>
                <th className="px-5 py-4 font-medium">Contact</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Source</th>
                <th className="px-5 py-4 font-medium">Owner</th>
                <th className="px-5 py-4 font-medium">Created</th>
                <th className="px-5 py-4 font-medium">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    Turbo
                  </span>
                </th>
                <th className="px-5 py-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div>
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="text-white font-medium hover:text-yellow-400 transition-colors"
                      >
                        {lead.first_name} {lead.last_name}
                      </Link>
                      {lead.city && lead.state && (
                        <p className="text-gray-500 text-sm">
                          {lead.city}, {lead.state}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      {lead.phone && (
                        <CallButton
                          phone={lead.phone}
                          leadId={lead.id}
                          entityName={`${lead.first_name} ${lead.last_name}`}
                          className="flex items-center gap-1 text-gray-300 hover:text-green-400 text-sm transition-colors"
                        >
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </CallButton>
                      )}
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="flex items-center gap-1 text-gray-300 hover:text-yellow-400 text-sm transition-colors"
                        >
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      className={`px-3 py-1.5 rounded-full border text-sm font-medium bg-transparent cursor-pointer focus:outline-none ${statusColors[lead.status]}`}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="unqualified">Unqualified</option>
                      <option value="converted">Converted</option>
                      <option value="dead">Dead</option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <div>
                      <p className="text-gray-300 text-sm capitalize">
                        {lead.source_type?.replace('_', ' ') || '-'}
                      </p>
                      {lead.campaign && (
                        <p className="text-gray-500 text-xs">{lead.campaign.name}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {lead.owner ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black text-xs font-bold">
                          {lead.owner.first_name[0]}{lead.owner.last_name[0]}
                        </div>
                        <span className="text-gray-300 text-sm">
                          {lead.owner.first_name} {lead.owner.last_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-sm">
                    {formatDate(lead.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    {lead.phone ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!turboQueueLeadIds[lead.id]}
                          onCheckedChange={(checked) => toggleTurboMode(lead.id, checked)}
                          disabled={!!turboLoading[lead.id]}
                          aria-label="Enlist in turbo mode"
                        />
                        <span className={`text-xs ${turboQueueLeadIds[lead.id] ? 'text-yellow-400' : 'text-gray-500'}`}>
                          {turboLoading[lead.id] ? '...' : turboQueueLeadIds[lead.id] ? 'Enlisted' : 'Off'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs">No phone</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                        className="p-1 text-gray-400 hover:text-yellow-400 rounded-lg hover:bg-white/10 transition-all"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>

                      {openMenuId === lead.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 top-8 z-20 w-48 glass-card rounded-xl shadow-xl py-1">
                            <button
                              onClick={() => {
                                setEditingLead(lead)
                                setOpenMenuId(null)
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Edit Lead
                            </button>

                            {lead.status !== 'converted' && (
                              <button
                                onClick={() => {
                                  setConvertingLead(lead)
                                  setOpenMenuId(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-yellow-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                              >
                                <ArrowRightCircle className="w-4 h-4" />
                                Convert to Deal
                              </button>
                            )}

                            {/* Assign submenu */}
                            <div className="border-t border-white/10 mt-1 pt-1">
                              <p className="px-4 py-1 text-xs text-gray-500 uppercase tracking-wide">Assign to</p>
                              {users.slice(0, 5).map((user) => (
                                <button
                                  key={user.id}
                                  onClick={() => handleAssign(lead.id, user.id)}
                                  className={`w-full px-4 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 transition-colors ${
                                    lead.owner?.id === user.id
                                      ? 'text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                >
                                  <UserPlus className="w-4 h-4" />
                                  {user.first_name} {user.last_name}
                                </button>
                              ))}
                            </div>

                            <div className="border-t border-white/10 mt-1 pt-1">
                              <button
                                onClick={() => handleDelete(lead.id, `${lead.first_name} ${lead.last_name}`)}
                                disabled={isDeleting}
                                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {isDeleting ? 'Deleting...' : 'Delete Lead'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-500">
                    {searchQuery || statusFilter !== 'all'
                      ? 'No leads match your filters'
                      : 'No leads yet. Create your first lead to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          users={users}
          campaigns={campaigns}
          onClose={() => setEditingLead(null)}
        />
      )}

      {/* Convert Modal */}
      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
        />
      )}
    </>
  )
}
