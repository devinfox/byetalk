'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Presentation,
  Search,
  Plus,
  Loader2,
  Trash2,
  MoreVertical,
  Grid,
  List,
  SortAsc,
  SortDesc,
  Edit,
  Copy,
  Eye,
  Layout,
  X,
  Users,
  Link2,
} from 'lucide-react'
import type { Presentation as PresentationType } from '@/types/presentation.types'

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
}

interface PresentationsPageClientProps {
  userId: string
  leads?: Lead[]
}

type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'date' | 'slides'
type SortOrder = 'asc' | 'desc'
type StatusFilter = 'all' | 'draft' | 'published' | 'archived'

const STATUS_COLORS = {
  draft: 'bg-gray-500/20 text-gray-400',
  published: 'bg-green-500/20 text-green-400',
  archived: 'bg-yellow-500/20 text-yellow-400',
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function PresentationsPageClient({ userId, leads = [] }: PresentationsPageClientProps) {
  const router = useRouter()
  const [presentations, setPresentations] = useState<PresentationType[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showMenu, setShowMenu] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newPresentationName, setNewPresentationName] = useState('Untitled Presentation')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [leadSearchQuery, setLeadSearchQuery] = useState('')

  const fetchPresentations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      const response = await fetch(`/api/presentations?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setPresentations(data.presentations || [])
      } else {
        console.error('Error fetching presentations:', data.error)
      }
    } catch (error) {
      console.error('Error fetching presentations:', error)
    }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    fetchPresentations()
  }, [fetchPresentations])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const response = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPresentationName || 'Untitled Presentation',
          lead_id: selectedLeadId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.presentation?.id) {
        router.push(`/dashboard/presentations/${data.presentation.id}`)
      } else {
        console.error('Error creating presentation:', data.error)
        alert(`Failed to create presentation: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating presentation:', error)
      alert('Failed to create presentation. Check console for details.')
    }
    setCreating(false)
    setShowCreateModal(false)
    setNewPresentationName('Untitled Presentation')
    setSelectedLeadId(null)
    setLeadSearchQuery('')
  }

  const openCreateModal = () => {
    setNewPresentationName('Untitled Presentation')
    setSelectedLeadId(null)
    setLeadSearchQuery('')
    setShowCreateModal(true)
  }

  const filteredLeads = leads.filter((lead) => {
    if (!leadSearchQuery) return true
    const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.toLowerCase()
    const email = (lead.email || '').toLowerCase()
    const company = (lead.company || '').toLowerCase()
    const query = leadSearchQuery.toLowerCase()
    return fullName.includes(query) || email.includes(query) || company.includes(query)
  })

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this presentation?')) return

    try {
      const response = await fetch(`/api/presentations/${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setPresentations((prev) => prev.filter((p) => p.id !== id))
      } else {
        console.error('Delete failed:', data.error)
        alert(`Failed to delete: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting presentation:', error)
      alert('Failed to delete presentation. Check console for details.')
    }
    setShowMenu(null)
  }

  const handleDuplicate = async (presentation: PresentationType) => {
    try {
      const response = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${presentation.name} (Copy)`,
          description: presentation.description,
          canvas_width: presentation.canvas_width,
          canvas_height: presentation.canvas_height,
          background_color: presentation.background_color,
        }),
      })

      if (response.ok) {
        fetchPresentations()
      }
    } catch (error) {
      console.error('Error duplicating presentation:', error)
    }
    setShowMenu(null)
  }

  // Filter and sort
  const filteredPresentations = presentations
    .filter((p) => {
      if (searchQuery) {
        return p.name.toLowerCase().includes(searchQuery.toLowerCase())
      }
      return true
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'date':
          comparison = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          break
        case 'slides':
          comparison = (b.slide_count || 0) - (a.slide_count || 0)
          break
      }
      return sortOrder === 'asc' ? -comparison : comparison
    })

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-white flex items-center gap-3">
            <Layout className="w-7 h-7 text-yellow-400" />
            Presentations
          </h1>
          <p className="text-gray-400 mt-1">
            {presentations.length} presentation{presentations.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Create Button */}
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-black transition-all hover:scale-105"
          style={{
            background:
              'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
          }}
        >
          <Plus className="w-4 h-4" />
          New Presentation
        </button>
      </div>

      {/* Toolbar */}
      <div className="glass-card p-4 mb-4 flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search presentations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
          >
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="slides">Slides</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            {sortOrder === 'asc' ? (
              <SortAsc className="w-4 h-4" />
            ) : (
              <SortDesc className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 transition-colors ${
              viewMode === 'grid'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 transition-colors ${
              viewMode === 'list'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Presentations Grid/List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        ) : filteredPresentations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Layout className="w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-400 mb-2">
              {searchQuery ? 'No presentations found' : 'No presentations yet'}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first presentation to get started'}
            </p>
            {!searchQuery && (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create your first presentation
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPresentations.map((presentation) => (
              <div
                key={presentation.id}
                className="glass-card overflow-hidden hover:bg-white/5 transition-colors cursor-pointer group relative"
                onClick={() => router.push(`/dashboard/presentations/${presentation.id}`)}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 relative overflow-hidden">
                  {presentation.thumbnail_url ? (
                    <img
                      src={presentation.thumbnail_url}
                      alt={presentation.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Presentation className="w-12 h-12 text-gray-700" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/20 rounded-lg text-sm text-white">
                      <Edit className="w-4 h-4" />
                      Edit
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white truncate">
                        {presentation.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {presentation.slide_count || 0} slide
                        {presentation.slide_count !== 1 ? 's' : ''} ·{' '}
                        {formatDate(presentation.updated_at)}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        STATUS_COLORS[presentation.status]
                      }`}
                    >
                      {presentation.status}
                    </span>
                  </div>
                </div>

                {/* Menu Button */}
                <div className="absolute top-2 right-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowMenu(showMenu === presentation.id ? null : presentation.id)
                    }}
                    className="p-1.5 bg-black/50 hover:bg-black/70 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {showMenu === presentation.id && (
                    <div
                      className="absolute right-0 mt-1 w-40 bg-gray-900 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          router.push(`/dashboard/presentations/${presentation.id}`)
                        }
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDuplicate(presentation)}
                        className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDelete(presentation.id)}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Slides
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPresentations.map((presentation) => (
                  <tr
                    key={presentation.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/presentations/${presentation.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-8 bg-gray-800 rounded flex items-center justify-center">
                          {presentation.thumbnail_url ? (
                            <img
                              src={presentation.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <Presentation className="w-4 h-4 text-gray-600" />
                          )}
                        </div>
                        <span className="text-sm text-white">{presentation.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {presentation.slide_count || 0}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          STATUS_COLORS[presentation.status]
                        }`}
                      >
                        {presentation.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(presentation.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            router.push(`/dashboard/presentations/${presentation.id}`)
                          }
                          className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(presentation)}
                          className="p-1.5 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(presentation.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {showMenu && (
        <div className="fixed inset-0 z-0" onClick={() => setShowMenu(null)} />
      )}

      {/* Create Presentation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="glass-card w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-white">New Presentation</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Presentation Name
                </label>
                <input
                  type="text"
                  value={newPresentationName}
                  onChange={(e) => setNewPresentationName(e.target.value)}
                  placeholder="Enter presentation name"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
                  autoFocus
                />
              </div>

              {/* Link to Lead (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <span className="flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Link to Lead
                    <span className="text-gray-500 font-normal">(optional)</span>
                  </span>
                </label>

                {selectedLeadId ? (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-yellow-400" />
                      <div>
                        <p className="text-sm text-white">
                          {leads.find(l => l.id === selectedLeadId)?.first_name}{' '}
                          {leads.find(l => l.id === selectedLeadId)?.last_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {leads.find(l => l.id === selectedLeadId)?.email || leads.find(l => l.id === selectedLeadId)?.company}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedLeadId(null)}
                      className="p-1 text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={leadSearchQuery}
                      onChange={(e) => setLeadSearchQuery(e.target.value)}
                      placeholder="Search leads..."
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-yellow-500/50"
                    />
                    {leads.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-500">No leads available</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto bg-white/5 border border-white/10 rounded-lg">
                        {filteredLeads.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-gray-500">No leads found</p>
                        ) : (
                          filteredLeads.slice(0, 5).map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => {
                                setSelectedLeadId(lead.id)
                                setLeadSearchQuery('')
                              }}
                              className="w-full px-4 py-2.5 text-left hover:bg-white/10 transition-colors flex items-center gap-3"
                            >
                              <Users className="w-4 h-4 text-gray-400" />
                              <div>
                                <p className="text-sm text-white">
                                  {lead.first_name} {lead.last_name}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {lead.email || lead.company || 'No email'}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-black disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
                }}
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
