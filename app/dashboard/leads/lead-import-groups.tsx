'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Zap,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  ChevronLeft,
  User,
  Phone,
  Mail,
  Bot,
  UserPlus,
  Users,
  Inbox,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface LeadGroup {
  id: string
  name: string
  file_name: string
  is_system: boolean
  lead_count: number
  queued_count: number
  is_turbo_enabled: boolean
  created_at: string
}

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  status: string
  created_at: string
  owner: { id: string; first_name: string; last_name: string } | null
}

interface LeadsResponse {
  leads: Lead[]
  total: number
  page: number
  totalPages: number
  perPage: number
}

export function LeadImportGroups() {
  const [groups, setGroups] = useState<LeadGroup[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})

  // Leads state per group
  const [groupLeads, setGroupLeads] = useState<Record<string, LeadsResponse>>({})
  const [groupSearches, setGroupSearches] = useState<Record<string, string>>({})
  const [loadingLeads, setLoadingLeads] = useState<Record<string, boolean>>({})

  const fetchGroups = useCallback(async () => {
    try {
      const response = await fetch('/api/leads/groups')
      if (response.ok) {
        const data = await response.json()
        setGroups(data.groups || [])
        setIsAdmin(data.isAdmin || false)
      } else {
        console.error('Error fetching lead groups:', response.status)
        setGroups([])
      }
    } catch (error) {
      console.error('Error fetching lead groups:', error)
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const fetchLeads = useCallback(async (groupId: string, page: number = 1, search: string = '') => {
    setLoadingLeads(prev => ({ ...prev, [groupId]: true }))

    try {
      const params = new URLSearchParams({ page: page.toString() })
      if (search) params.append('search', search)

      const response = await fetch(`/api/leads/import/${groupId}/leads?${params}`)
      if (response.ok) {
        const data = await response.json()
        setGroupLeads(prev => ({ ...prev, [groupId]: data }))
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoadingLeads(prev => ({ ...prev, [groupId]: false }))
    }
  }, [])

  const toggleExpand = async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null)
    } else {
      setExpandedGroup(groupId)
      if (!groupLeads[groupId]) {
        await fetchLeads(groupId, 1, groupSearches[groupId] || '')
      }
    }
  }

  const handleSearch = (groupId: string, search: string) => {
    setGroupSearches(prev => ({ ...prev, [groupId]: search }))
    fetchLeads(groupId, 1, search)
  }

  const handlePageChange = (groupId: string, page: number) => {
    fetchLeads(groupId, page, groupSearches[groupId] || '')
  }

  const toggleTurbo = async (groupId: string, shouldEnable: boolean) => {
    setToggling(prev => ({ ...prev, [groupId]: true }))

    try {
      if (shouldEnable) {
        const response = await fetch('/api/turbo/queue/import-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import_job_id: groupId }),
        })

        if (!response.ok) {
          console.error('Failed to enable turbo:', await response.text())
        }
      } else {
        const response = await fetch(`/api/turbo/queue/import-job?import_job_id=${groupId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          console.error('Failed to disable turbo:', await response.text())
        }
      }

      await fetchGroups()
    } catch (error) {
      console.error('Error toggling turbo:', error)
    } finally {
      setToggling(prev => {
        const next = { ...prev }
        delete next[groupId]
        return next
      })
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getGroupIcon = (group: LeadGroup) => {
    if (group.file_name === 'ai-generated') {
      return <Bot className="w-5 h-5 text-purple-400" />
    }
    if (group.file_name === 'individually-added') {
      return <UserPlus className="w-5 h-5 text-blue-400" />
    }
    if (group.file_name === 'uncategorized') {
      return <Inbox className="w-5 h-5 text-gray-400" />
    }
    return <FileSpreadsheet className="w-5 h-5 text-yellow-400" />
  }

  const getGroupIconBg = (group: LeadGroup) => {
    if (group.file_name === 'ai-generated') {
      return 'bg-purple-500/20'
    }
    if (group.file_name === 'individually-added') {
      return 'bg-blue-500/20'
    }
    if (group.file_name === 'uncategorized') {
      return 'bg-gray-500/20'
    }
    return 'bg-yellow-500/20'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-500/20 text-blue-400'
      case 'contacted':
        return 'bg-yellow-500/20 text-yellow-400'
      case 'qualified':
        return 'bg-green-500/20 text-green-400'
      case 'converted':
        return 'bg-purple-500/20 text-purple-400'
      case 'lost':
        return 'bg-red-500/20 text-red-400'
      default:
        return 'bg-gray-500/20 text-gray-400'
    }
  }

  const formatPhone = (phone: string | null) => {
    if (!phone) return '-'
    if (phone.length === 10) {
      return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    }
    return phone
  }

  if (loading) {
    return (
      <div className="glass-card">
        <div className="p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
          <span className="text-gray-400">Loading your leads...</span>
        </div>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No Leads Yet</h3>
        <p className="text-gray-400 text-sm">
          {isAdmin
            ? 'Import a CSV file or add leads manually to get started.'
            : 'Leads will appear here once you connect with them through the dialer.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const isExpanded = expandedGroup === group.id
        const leadsData = groupLeads[group.id]
        const isLoadingLeads = loadingLeads[group.id]
        const searchQuery = groupSearches[group.id] || ''

        return (
          <div key={group.id} className="glass-card overflow-hidden">
            {/* Header */}
            <div className="p-4 flex items-center justify-between">
              <button
                onClick={() => toggleExpand(group.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              >
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
                <div className={`w-10 h-10 rounded-xl ${getGroupIconBg(group)} flex items-center justify-center flex-shrink-0`}>
                  {getGroupIcon(group)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">
                    {group.name}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {group.lead_count.toLocaleString()} lead{group.lead_count !== 1 ? 's' : ''}
                    {!group.is_system && ` · ${formatDate(group.created_at)}`}
                  </p>
                </div>
              </button>

              {/* Admin controls */}
              {isAdmin && (
                <div className="flex items-center gap-4 flex-shrink-0">
                  {/* Turbo badge */}
                  {group.is_turbo_enabled && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {group.queued_count.toLocaleString()} queued
                    </span>
                  )}

                  {/* Turbo toggle - hide for uncategorized virtual group */}
                  {group.id !== 'uncategorized' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Turbo</span>
                      <Switch
                        checked={group.is_turbo_enabled}
                        onCheckedChange={(checked) => toggleTurbo(group.id, checked)}
                        disabled={!!toggling[group.id] || group.lead_count === 0}
                        aria-label={`Toggle turbo mode for ${group.name}`}
                      />
                      {toggling[group.id] && (
                        <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-white/10">
                {/* Search Bar */}
                <div className="p-4 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search leads..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(group.id, e.target.value)}
                      className="w-full pl-10 pr-4 py-2 glass-input text-sm"
                    />
                  </div>
                </div>

                {/* Leads Table */}
                {isLoadingLeads ? (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                  </div>
                ) : leadsData && leadsData.leads.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-white/5">
                            <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Name</th>
                            <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Phone</th>
                            <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Email</th>
                            <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Status</th>
                            {isAdmin && (
                              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wide">Owner</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {leadsData.leads.map((lead) => (
                            <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3">
                                <Link
                                  href={`/dashboard/leads/${lead.id}`}
                                  className="flex items-center gap-2 hover:text-yellow-400 transition-colors"
                                >
                                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <User className="w-4 h-4 text-gray-400" />
                                  </div>
                                  <span className="text-white font-medium">
                                    {lead.first_name || ''} {lead.last_name || ''}
                                    {!lead.first_name && !lead.last_name && <span className="text-gray-500">Unknown</span>}
                                  </span>
                                </Link>
                              </td>
                              <td className="px-4 py-3">
                                {lead.phone ? (
                                  <span className="flex items-center gap-2 text-gray-300">
                                    <Phone className="w-3 h-3 text-gray-500" />
                                    {formatPhone(lead.phone)}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {lead.email ? (
                                  <span className="flex items-center gap-2 text-gray-300 truncate max-w-[200px]">
                                    <Mail className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                    {lead.email}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-1 rounded-full capitalize ${getStatusColor(lead.status)}`}>
                                  {lead.status}
                                </span>
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-3">
                                  {lead.owner ? (
                                    <span className="text-gray-300 text-sm">
                                      {lead.owner.first_name} {lead.owner.last_name}
                                    </span>
                                  ) : (
                                    <span className="text-gray-600 text-sm">Unassigned</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {leadsData.totalPages > 1 && (
                      <div className="p-4 border-t border-white/10 flex items-center justify-between">
                        <p className="text-sm text-gray-400">
                          Showing {((leadsData.page - 1) * leadsData.perPage) + 1}-
                          {Math.min(leadsData.page * leadsData.perPage, leadsData.total)} of {leadsData.total.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePageChange(group.id, leadsData.page - 1)}
                            disabled={leadsData.page <= 1}
                            className="p-2 glass-button rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-sm text-gray-400 px-2">
                            Page {leadsData.page} of {leadsData.totalPages}
                          </span>
                          <button
                            onClick={() => handlePageChange(group.id, leadsData.page + 1)}
                            disabled={leadsData.page >= leadsData.totalPages}
                            className="p-2 glass-button rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    {searchQuery ? 'No leads match your search' : 'No leads in this list'}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
