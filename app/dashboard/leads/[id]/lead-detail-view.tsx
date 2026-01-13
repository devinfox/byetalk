'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Mail,
  MapPin,
  Calendar,
  User,
  Pencil,
  Trash2,
  ArrowRightCircle,
  Plus,
  Clock,
  CheckCircle,
  Circle,
  MessageSquare,
  Activity,
  Target,
  Tag,
  Sparkles,
  FileText,
  Brain,
  Lightbulb,
  TrendingUp,
  DollarSign,
  Heart,
  Star,
  Loader2,
  Send,
  RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { CallButton } from '@/components/call-button'
import { EditLeadModal } from '../edit-lead-modal'
import { ConvertLeadModal } from '../convert-lead-modal'
import { EnrollLeadModal } from '@/components/enroll-lead-modal'
import type { Lead, User as UserType, Campaign, Note, Task, ActivityLog, Call } from '@/types/database.types'

interface CallWithUser extends Call {
  user: { id: string; first_name: string; last_name: string } | null
}

interface EmailWithThread {
  id: string
  from_address: string
  from_name: string | null
  to_addresses: Array<{ email: string; name?: string | null }>
  subject: string | null
  snippet: string | null
  body_text: string | null
  sent_at: string | null
  created_at: string
  is_inbound: boolean
  ai_summary: string | null
  ai_sentiment: string | null
  thread: { id: string; subject: string | null } | null
}

interface LeadDetailViewProps {
  lead: Lead & {
    owner: { id: string; first_name: string; last_name: string; email: string } | null
    campaign: { id: string; name: string; code: string | null } | null
    converted_deal?: { id: string; name: string; stage: string } | null
  }
  activities: ActivityLog[]
  notes: (Note & { author: { id: string; first_name: string; last_name: string } | null })[]
  tasks: (Task & { assignee: { id: string; first_name: string; last_name: string } | null })[]
  calls: CallWithUser[]
  emails: EmailWithThread[]
  users: Pick<UserType, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  currentUser: UserType | null
}

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  contacted: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  qualified: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  unqualified: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  converted: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  dead: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
}

export function LeadDetailView({
  lead,
  activities,
  notes,
  tasks,
  calls,
  emails,
  users,
  campaigns,
  currentUser,
}: LeadDetailViewProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'notes' | 'tasks' | 'calls' | 'emails'>('activity')
  const [expandedCall, setExpandedCall] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', due_at: '' })
  const [addingTask, setAddingTask] = useState(false)
  const [isProfileUpdating, setIsProfileUpdating] = useState(false)
  const [reprocessingCallId, setReprocessingCallId] = useState<string | null>(null)

  // Subscribe to realtime updates for this lead's AI profile
  useEffect(() => {
    const supabase = createClient()

    // Subscribe to changes on this lead
    const channel = supabase
      .channel(`lead-profile-${lead.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
          filter: `id=eq.${lead.id}`,
        },
        (payload) => {
          // Check if AI profile was updated
          const newData = payload.new as { ai_profile_updated_at?: string }
          const oldData = payload.old as { ai_profile_updated_at?: string }

          if (newData.ai_profile_updated_at !== oldData.ai_profile_updated_at) {
            console.log('Lead AI profile updated, refreshing...')
            setIsProfileUpdating(false)
            router.refresh()
          }
        }
      )
      .subscribe()

    // Also subscribe to calls table to show loading state when a call is being processed
    const callsChannel = supabase
      .channel(`lead-calls-${lead.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `lead_id=eq.${lead.id}`,
        },
        (payload) => {
          const newCall = payload.new as { id?: string; ai_analysis_status?: string }
          if (newCall.ai_analysis_status === 'processing') {
            setIsProfileUpdating(true)
          } else if (newCall.ai_analysis_status === 'completed' || newCall.ai_analysis_status === 'failed') {
            // Clear reprocessing state when done
            setReprocessingCallId(null)
            setIsProfileUpdating(false)
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(callsChannel)
    }
  }, [lead.id, router])

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    const leadName = `${lead.first_name} ${lead.last_name}`
    if (!confirm(`Are you sure you want to permanently delete "${leadName}"?\n\nThis action cannot be undone. All associated data will be unlinked.`)) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        alert(`Failed to delete lead: ${data.error || 'Unknown error'}`)
        return
      }

      router.push('/dashboard/leads')
    } catch (error) {
      console.error('Error deleting lead:', error)
      alert('Failed to delete lead. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setAddingNote(true)

    const supabase = createClient()
    await supabase.from('notes').insert({
      entity_type: 'lead',
      entity_id: lead.id,
      content: newNote.trim(),
      created_by: currentUser?.id,
    })

    setNewNote('')
    setAddingNote(false)
    router.refresh()
  }

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return
    setAddingTask(true)

    const supabase = createClient()
    await supabase.from('tasks').insert({
      entity_type: 'lead',
      entity_id: lead.id,
      title: newTask.title.trim(),
      due_at: newTask.due_at || null,
      assigned_to: currentUser?.id,
      assigned_by: currentUser?.id,
    })

    setNewTask({ title: '', due_at: '' })
    setAddingTask(false)
    router.refresh()
  }

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const supabase = createClient()
    await supabase
      .from('tasks')
      .update({
        status: currentStatus === 'completed' ? 'pending' : 'completed',
        completed_at: currentStatus === 'completed' ? null : new Date().toISOString(),
      })
      .eq('id', taskId)

    router.refresh()
  }

  const handleReprocessCall = async (callId: string) => {
    setReprocessingCallId(callId)
    try {
      const response = await fetch('/api/calls/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId }),
      })

      if (response.ok) {
        // The realtime subscription will detect when processing is complete
        // and refresh the page
        console.log('Call reprocessing started')
      } else {
        const error = await response.json()
        console.error('Failed to reprocess call:', error)
        alert('Failed to reprocess call. Please try again.')
        setReprocessingCallId(null)
      }
    } catch (error) {
      console.error('Error reprocessing call:', error)
      alert('Failed to reprocess call. Please try again.')
      setReprocessingCallId(null)
    }
  }

  const statusStyle = statusColors[lead.status] || statusColors.new

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/leads"
              className="p-2.5 text-gray-400 hover:text-yellow-400 rounded-xl hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-light text-white tracking-wide">
                  <span className="text-gold-gradient font-semibold">{lead.first_name}</span> {lead.last_name}
                </h1>
                <span className={`px-3 py-1 rounded-full border text-sm font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                  {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                </span>
              </div>
              {/* AI Tags */}
              {lead.ai_tags && lead.ai_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {lead.ai_tags.map((tag, idx) => {
                    const tagColors: Record<string, string> = {
                      investment: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                      budget: 'bg-green-500/20 text-green-300 border-green-500/30',
                      personality: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
                      situation: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
                      relationship: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
                      motivation: 'bg-red-500/20 text-red-300 border-red-500/30',
                      timeline: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
                    }
                    const colorClass = tagColors[tag.category] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                    return (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium rounded-full border ${colorClass}`}
                      >
                        {tag.label}
                      </span>
                    )
                  })}
                </div>
              )}
              <p className="text-gray-400 mt-1 text-sm">
                Lead created {formatDate(lead.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lead.status !== 'converted' && (
              <button
                onClick={() => setIsConverting(true)}
                className="flex items-center gap-2 px-5 py-2.5 glass-button-gold rounded-xl text-sm font-medium transition-all hover:scale-105"
              >
                <ArrowRightCircle className="w-4 h-4" />
                Convert to Deal
              </button>
            )}
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2.5 glass-button rounded-xl text-sm font-medium text-gray-300 hover:text-white transition-all"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        {/* Converted Banner */}
        {lead.status === 'converted' && lead.converted_deal && (
          <div className="glass-card p-5 border-purple-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-purple-400 font-medium">Lead Converted</p>
                <p className="text-gray-400 text-sm">
                  Converted to deal{' '}
                  <Link href={`/dashboard/deals/${lead.converted_deal.id}`} className="text-purple-400 hover:underline">
                    {lead.converted_deal.name}
                  </Link>
                  {lead.converted_at && ` on ${formatDate(lead.converted_at)}`}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact & Lead Info - Compact */}
            <div className="glass-card p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-500 text-[10px] uppercase">Email</p>
                      <a href={`mailto:${lead.email}`} className="text-white text-sm hover:text-yellow-400 truncate block">
                        {lead.email}
                      </a>
                    </div>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-500 text-[10px] uppercase">Phone</p>
                      <CallButton
                        phone={lead.phone || ''}
                        leadId={lead.id}
                        entityName={`${lead.first_name} ${lead.last_name}`}
                        className="text-white text-sm hover:text-green-400"
                      >
                        {lead.phone}
                      </CallButton>
                    </div>
                  </div>
                )}
                {(lead.city || lead.state) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-500 text-[10px] uppercase">Location</p>
                      <p className="text-white text-sm truncate">
                        {[lead.city, lead.state].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {lead.owner ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-[8px] flex-shrink-0">
                        {lead.owner.first_name[0]}{lead.owner.last_name[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-gray-500 text-[10px] uppercase">Owner</p>
                        <p className="text-white text-sm truncate">
                          {lead.owner.first_name} {lead.owner.last_name}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-gray-400 font-bold text-[8px] flex-shrink-0">
                        ?
                      </div>
                      <div className="min-w-0">
                        <p className="text-gray-500 text-[10px] uppercase">Owner</p>
                        <p className="text-gray-400 text-sm truncate">
                          Unassigned
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-500 text-[10px] uppercase">Source</p>
                    <p className="text-white text-sm capitalize truncate">
                      {lead.source_type?.replace('_', ' ') || 'Unknown'}
                    </p>
                  </div>
                </div>
                {lead.campaign && (
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-500 text-[10px] uppercase">Campaign</p>
                      <p className="text-white text-sm truncate">{lead.campaign.name}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-500 text-[10px] uppercase">Created</p>
                    <p className="text-white text-sm">{formatDate(lead.created_at)}</p>
                  </div>
                </div>
                {lead.assigned_at && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-500 text-[10px] uppercase">Assigned</p>
                      <p className="text-white text-sm">{formatDate(lead.assigned_at)}</p>
                    </div>
                  </div>
                )}
              </div>
              {lead.notes && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-gray-500 text-[10px] uppercase mb-1">Notes</p>
                  <p className="text-white text-sm whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </div>

            {/* AI Lead Summary - Always Show */}
            <div className="glass-card p-4 border-yellow-500/20 relative">
              {isProfileUpdating && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Analyzing call & updating profile...</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-5 h-5 text-yellow-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide">AI Lead Summary</h2>
                {lead.ai_profile_updated_at && (
                  <span className="ml-auto text-gray-500 text-xs">Updated {formatDate(lead.ai_profile_updated_at)}</span>
                )}
              </div>
              {lead.ai_profile_summary ? (
                <p className="text-gray-300 text-sm leading-relaxed">{lead.ai_profile_summary}</p>
              ) : (
                <p className="text-gray-500 text-sm italic">No AI summary yet. Make a call to this lead to generate insights.</p>
              )}
              {lead.ai_profile_details?.overall_assessment && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-yellow-400 text-xs uppercase mb-1">Assessment</p>
                  <p className="text-gray-300 text-sm italic">{lead.ai_profile_details.overall_assessment}</p>
                </div>
              )}
              {lead.ai_profile_details?.evolution_notes && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-purple-400 text-xs uppercase mb-1">Latest Evolution</p>
                  <p className="text-gray-400 text-sm">{lead.ai_profile_details.evolution_notes}</p>
                </div>
              )}
              {lead.ai_profile_details?.call_count && (
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-4 text-xs text-gray-500">
                  <span>Based on {lead.ai_profile_details.call_count} call{lead.ai_profile_details.call_count > 1 ? 's' : ''}</span>
                  {lead.ai_profile_details.total_talk_time_minutes && (
                    <span>• {lead.ai_profile_details.total_talk_time_minutes} mins total talk time</span>
                  )}
                </div>
              )}
            </div>

            {/* AI Coaching Tips - Always Show */}
            <div className="glass-card p-4 border-yellow-500/20 relative">
              {isProfileUpdating && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Generating coaching tips...</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Coaching Tips</h2>
              </div>
              {lead.ai_coaching_tips && lead.ai_coaching_tips.length > 0 ? (
                <ul className="space-y-2">
                  {lead.ai_coaching_tips.map((tip: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-yellow-400 font-bold">{idx + 1}.</span>
                      <span className="text-gray-300">{tip}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm italic">No coaching tips yet. Call history will generate personalized tips.</p>
              )}
            </div>

            {/* Activity Tabs */}
            <div className="glass-card">
              <div className="border-b border-white/10">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'activity'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Activity className="w-4 h-4 inline mr-2" />
                    Activity ({activities.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'notes'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 inline mr-2" />
                    Notes ({notes.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'tasks'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    Tasks ({tasks.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('calls')}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'calls'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Phone className="w-4 h-4 inline mr-2" />
                    Calls ({calls.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('emails')}
                    className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'emails'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Mail className="w-4 h-4 inline mr-2" />
                    Emails ({emails.length})
                  </button>
                </div>
              </div>

              <div className="p-5">
                {activeTab === 'activity' && (
                  <div className="space-y-4">
                    {activities.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No activity recorded yet</p>
                    ) : (
                      activities.map((activity) => (
                        <div key={activity.id} className="flex gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                            <Activity className="w-4 h-4 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-white text-sm">{activity.event_description || activity.event_type}</p>
                            <p className="text-gray-500 text-xs mt-1">
                              {formatDateTime(activity.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    {/* Add Note */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a note..."
                        className="glass-input flex-1 px-4 py-2.5"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={addingNote || !newNote.trim()}
                        className="px-4 py-2.5 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {notes.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No notes yet</p>
                    ) : (
                      notes.map((note) => (
                        <div key={note.id} className="glass-card-subtle rounded-xl p-4">
                          <p className="text-white text-sm">{note.content}</p>
                          <p className="text-gray-500 text-xs mt-2">
                            {note.author && `${note.author.first_name} ${note.author.last_name} • `}
                            {formatDateTime(note.created_at)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'tasks' && (
                  <div className="space-y-4">
                    {/* Add Task */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        placeholder="Add a task..."
                        className="glass-input flex-1 px-4 py-2.5"
                      />
                      <input
                        type="date"
                        value={newTask.due_at}
                        onChange={(e) => setNewTask({ ...newTask, due_at: e.target.value })}
                        className="glass-input px-3 py-2.5"
                      />
                      <button
                        onClick={handleAddTask}
                        disabled={addingTask || !newTask.title.trim()}
                        className="px-4 py-2.5 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {tasks.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No tasks yet</p>
                    ) : (
                      tasks.map((task) => (
                        <div
                          key={task.id}
                          className={`flex items-center gap-3 p-4 rounded-xl ${
                            task.status === 'completed' ? 'glass-card-subtle opacity-60' : 'glass-card-subtle'
                          }`}
                        >
                          <button
                            onClick={() => handleToggleTask(task.id, task.status)}
                            className="text-gray-400 hover:text-white transition-colors"
                          >
                            {task.status === 'completed' ? (
                              <CheckCircle className="w-5 h-5 text-green-400" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>
                          <div className="flex-1">
                            <p
                              className={`text-sm ${
                                task.status === 'completed'
                                  ? 'text-gray-500 line-through'
                                  : 'text-white'
                              }`}
                            >
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              {task.due_at && (
                                <span className={
                                  new Date(task.due_at) < new Date() && task.status !== 'completed'
                                    ? 'text-red-400'
                                    : ''
                                }>
                                  Due {formatDate(task.due_at)}
                                </span>
                              )}
                              {task.assignee && (
                                <span>
                                  {task.assignee.first_name} {task.assignee.last_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'calls' && (
                  <div className="space-y-4">
                    {calls.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No calls recorded yet</p>
                    ) : (
                      calls.map((call) => {
                        const isExpanded = expandedCall === call.id
                        const formatDuration = (seconds: number) => {
                          const mins = Math.floor(seconds / 60)
                          const secs = seconds % 60
                          return `${mins}:${secs.toString().padStart(2, '0')}`
                        }

                        return (
                          <div
                            key={call.id}
                            className="glass-card-subtle rounded-xl overflow-hidden"
                          >
                            {/* Call Header */}
                            <div
                              className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                              onClick={() => setExpandedCall(isExpanded ? null : call.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                  call.disposition === 'answered'
                                    ? 'bg-green-500/20'
                                    : call.disposition === 'voicemail'
                                    ? 'bg-yellow-500/20'
                                    : 'bg-red-500/20'
                                }`}>
                                  {call.direction === 'outbound' ? (
                                    <PhoneOutgoing className={`w-5 h-5 ${
                                      call.disposition === 'answered'
                                        ? 'text-green-400'
                                        : call.disposition === 'voicemail'
                                        ? 'text-yellow-400'
                                        : 'text-red-400'
                                    }`} />
                                  ) : (
                                    <PhoneIncoming className={`w-5 h-5 ${
                                      call.disposition === 'answered'
                                        ? 'text-green-400'
                                        : call.disposition === 'voicemail'
                                        ? 'text-yellow-400'
                                        : 'text-red-400'
                                    }`} />
                                  )}
                                </div>

                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-medium capitalize">
                                      {call.direction} Call
                                    </span>
                                    {call.ai_summary && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                                        <Sparkles className="w-3 h-3" />
                                        AI Analyzed
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                                    <span>{formatDateTime(call.started_at)}</span>
                                    {call.duration_seconds > 0 && (
                                      <span>{formatDuration(call.duration_seconds)}</span>
                                    )}
                                    {call.user && (
                                      <span>{call.user.first_name} {call.user.last_name}</span>
                                    )}
                                  </div>
                                </div>

                                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                                  call.disposition === 'answered'
                                    ? 'bg-green-500/20 text-green-400'
                                    : call.disposition === 'voicemail'
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : !call.disposition
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {call.disposition?.replace('_', ' ') || 'Pending'}
                                </div>
                              </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-4 border-t border-white/10">
                                {/* Recording Player */}
                                {call.recording_url && (
                                  <div className="mt-4">
                                    <p className="text-sm text-gray-400 mb-2 uppercase tracking-wide">Recording</p>
                                    <audio
                                      controls
                                      className="w-full h-10"
                                      style={{ filter: 'invert(1)' }}
                                    >
                                      <source src={`/api/recordings/${call.id}`} type="audio/mpeg" />
                                      Your browser does not support the audio element.
                                    </audio>
                                  </div>
                                )}

                                {/* AI Analysis */}
                                {call.ai_summary && (
                                  <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Sparkles className="w-4 h-4 text-purple-400" />
                                      <span className="text-purple-400 font-medium text-sm uppercase tracking-wide">AI Analysis</span>
                                    </div>
                                    <p className="text-gray-300 text-sm">{call.ai_summary}</p>

                                    {call.ai_sentiment && (
                                      <div className="flex items-center gap-4 mt-3 text-xs">
                                        <span className={`px-2 py-1 rounded-full ${
                                          call.ai_sentiment === 'positive' ? 'bg-green-500/20 text-green-400' :
                                          call.ai_sentiment === 'negative' ? 'bg-red-500/20 text-red-400' :
                                          'bg-gray-500/20 text-gray-400'
                                        }`}>
                                          Sentiment: {call.ai_sentiment}
                                        </span>
                                        {call.ai_lead_quality_score && (
                                          <span className="text-gray-400">
                                            Lead Score: {call.ai_lead_quality_score}/10
                                          </span>
                                        )}
                                        {call.ai_close_probability && (
                                          <span className="text-gray-400">
                                            Close Probability: {call.ai_close_probability}%
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {call.ai_key_topics && call.ai_key_topics.length > 0 && (
                                      <div className="mt-3">
                                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Key Topics</p>
                                        <div className="flex flex-wrap gap-1">
                                          {call.ai_key_topics.map((topic, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-white/10 text-gray-300 rounded-full text-xs">
                                              {topic}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {call.ai_objections && call.ai_objections.length > 0 && (
                                      <div className="mt-3">
                                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Objections</p>
                                        <ul className="list-disc list-inside text-gray-400 text-xs">
                                          {call.ai_objections.map((obj, i) => (
                                            <li key={i}>{obj}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Compliance Warnings */}
                                {(call as CallWithUser & { compliance_warnings?: Array<{ severity: string; category: string; quote: string; issue: string; suggestion: string }> }).compliance_warnings &&
                                 (call as CallWithUser & { compliance_warnings?: Array<{ severity: string; category: string; quote: string; issue: string; suggestion: string }> }).compliance_warnings!.length > 0 && (
                                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                                    <div className="flex items-center gap-2 mb-3">
                                      <span className="text-lg">⚠️</span>
                                      <span className="text-red-400 font-medium text-sm uppercase tracking-wide">Compliance Warnings</span>
                                      <span className="ml-auto px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                                        {(call as CallWithUser & { compliance_warnings?: Array<{ severity: string; category: string; quote: string; issue: string; suggestion: string }> }).compliance_warnings!.length} {(call as CallWithUser & { compliance_warnings?: Array<{ severity: string; category: string; quote: string; issue: string; suggestion: string }> }).compliance_warnings!.length === 1 ? 'issue' : 'issues'}
                                      </span>
                                    </div>
                                    <div className="space-y-3">
                                      {(call as CallWithUser & { compliance_warnings?: Array<{ severity: string; category: string; quote: string; issue: string; suggestion: string }> }).compliance_warnings!.map((warning, i) => (
                                        <div key={i} className={`p-3 rounded-lg border ${
                                          warning.severity === 'high' ? 'bg-red-500/10 border-red-500/30' :
                                          warning.severity === 'medium' ? 'bg-orange-500/10 border-orange-500/30' :
                                          'bg-yellow-500/10 border-yellow-500/30'
                                        }`}>
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                                              warning.severity === 'high' ? 'bg-red-500/30 text-red-300' :
                                              warning.severity === 'medium' ? 'bg-orange-500/30 text-orange-300' :
                                              'bg-yellow-500/30 text-yellow-300'
                                            }`}>
                                              {warning.severity}
                                            </span>
                                            <span className="px-2 py-0.5 bg-white/10 text-gray-300 rounded-full text-xs capitalize">
                                              {warning.category?.replace('_', ' ')}
                                            </span>
                                          </div>
                                          <p className="text-gray-300 text-sm italic mb-2">"{warning.quote}"</p>
                                          <p className="text-gray-400 text-xs mb-2">
                                            <span className="text-red-400 font-medium">Issue:</span> {warning.issue}
                                          </p>
                                          <p className="text-gray-300 text-xs bg-green-500/10 border border-green-500/20 rounded-lg p-2">
                                            <span className="text-green-400 font-medium">✓ Say instead:</span> {warning.suggestion}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Transcription */}
                                {(call.transcription || call.recording_url) && (
                                  <div className="mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        <span className="text-gray-400 font-medium text-sm uppercase tracking-wide">Transcription</span>
                                      </div>
                                      {call.recording_url && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleReprocessCall(call.id)
                                          }}
                                          disabled={reprocessingCallId === call.id}
                                          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                          title={call.transcription ? "Reprocess transcription with corrected speaker labels" : "Process recording to generate transcription"}
                                        >
                                          <RefreshCw className={`w-3 h-3 ${reprocessingCallId === call.id ? 'animate-spin' : ''}`} />
                                          {reprocessingCallId === call.id ? 'Processing...' : (call.transcription ? 'Reprocess' : 'Process')}
                                        </button>
                                      )}
                                    </div>
                                    {/* Check for diarized transcript in custom_fields */}
                                    {(call.custom_fields as Record<string, unknown>)?.diarized_transcript ? (
                                      <div className="glass-card-subtle rounded-xl p-4 max-h-64 overflow-y-auto space-y-2">
                                        {((call.custom_fields as Record<string, unknown>).diarized_transcript as Array<{
                                          speaker: string
                                          text: string
                                          start: number
                                          end: number
                                        }>).map((utterance, idx) => {
                                          // Multichannel transcription uses 'Employee' and 'Lead' labels
                                          const isEmployee = utterance.speaker === 'Employee'
                                          const speakerName = isEmployee
                                            ? (call.user ? `${call.user.first_name}` : 'Employee')
                                            : `${lead.first_name || 'Lead'}`

                                          return (
                                            <div
                                              key={idx}
                                              className={`flex ${isEmployee ? 'justify-end' : 'justify-start'}`}
                                            >
                                              <div
                                                className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                                                  isEmployee
                                                    ? 'bg-yellow-500/20 border border-yellow-500/30'
                                                    : 'bg-white/10 border border-white/10'
                                                }`}
                                              >
                                                <p className={`text-xs font-medium mb-1 ${
                                                  isEmployee ? 'text-yellow-400' : 'text-blue-400'
                                                }`}>
                                                  {speakerName}
                                                </p>
                                                <p className="text-gray-200 text-sm">{utterance.text}</p>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : call.transcription ? (
                                      <div className="glass-card-subtle rounded-xl p-4 max-h-48 overflow-y-auto">
                                        <p className="text-gray-300 text-sm whitespace-pre-wrap">
                                          {call.transcription}
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="glass-card-subtle rounded-xl p-4 text-center">
                                        <p className="text-gray-500 text-sm">
                                          No transcription available. Click "Process" to generate one.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Outcome Notes */}
                                {call.outcome_notes && (
                                  <div className="mt-4">
                                    <p className="text-sm text-gray-400 mb-1 uppercase tracking-wide">Notes</p>
                                    <p className="text-gray-300 text-sm">{call.outcome_notes}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {activeTab === 'emails' && (
                  <div className="space-y-4">
                    {emails.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No emails recorded yet</p>
                    ) : (
                      emails.map((email) => {
                        const formatDateTime = (dateStr: string) => {
                          const date = new Date(dateStr)
                          return date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        }

                        return (
                          <Link
                            key={email.id}
                            href={`/dashboard/email/${email.thread?.id || email.id}`}
                            className="block glass-card-subtle rounded-xl p-4 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                email.is_inbound
                                  ? 'bg-blue-500/20'
                                  : 'bg-yellow-500/20'
                              }`}>
                                <Mail className={`w-5 h-5 ${
                                  email.is_inbound ? 'text-blue-400' : 'text-yellow-400'
                                }`} />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-white font-medium truncate">
                                    {email.is_inbound ? (
                                      <>From: {email.from_name || email.from_address}</>
                                    ) : (
                                      <>To: {email.to_addresses?.[0]?.email || 'Unknown'}</>
                                    )}
                                  </span>
                                  {email.ai_summary && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs flex-shrink-0">
                                      <Sparkles className="w-3 h-3" />
                                      AI
                                    </span>
                                  )}
                                  {email.ai_sentiment && (
                                    <span className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${
                                      email.ai_sentiment === 'positive'
                                        ? 'bg-green-500/20 text-green-400'
                                        : email.ai_sentiment === 'negative'
                                        ? 'bg-red-500/20 text-red-400'
                                        : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                      {email.ai_sentiment}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-white font-medium truncate">
                                  {email.subject || '(no subject)'}
                                </p>
                                <p className="text-sm text-gray-400 truncate mt-1">
                                  {email.ai_summary || email.snippet || '(no preview)'}
                                </p>
                                <p className="text-xs text-gray-500 mt-2">
                                  {formatDateTime(email.sent_at || email.created_at)}
                                </p>
                              </div>

                              <div className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                                email.is_inbound
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {email.is_inbound ? 'Received' : 'Sent'}
                              </div>
                            </div>
                          </Link>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Quick Stats</h2>
              <div className="space-y-4">
                <div className="glass-card-subtle p-4 rounded-xl text-center">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Days Since Created</p>
                  <p className="text-3xl font-bold text-gold-gradient">
                    {Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))}
                  </p>
                </div>
                <div className="glass-card-subtle p-4 rounded-xl text-center">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Activities</p>
                  <p className="text-3xl font-bold text-white">{activities.length}</p>
                </div>
                <div className="glass-card-subtle p-4 rounded-xl text-center">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Open Tasks</p>
                  <p className="text-3xl font-bold text-white">
                    {tasks.filter(t => t.status !== 'completed').length}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Quick Actions</h2>
              <div className="space-y-2">
                {lead.phone && (
                  <CallButton
                    phone={lead.phone}
                    leadId={lead.id}
                    entityName={`${lead.first_name} ${lead.last_name}`}
                    className="flex items-center gap-3 w-full px-4 py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-xl transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    Call Lead
                  </CallButton>
                )}
                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="flex items-center gap-3 w-full px-4 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl transition-all"
                  >
                    <Mail className="w-4 h-4" />
                    Send Email
                  </a>
                )}
                <button
                  onClick={() => setIsEnrolling(true)}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-xl transition-all"
                >
                  <Send className="w-4 h-4" />
                  Enroll in Campaign
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <EditLeadModal
          lead={{
            ...lead,
            owner: lead.owner ? { id: lead.owner.id, first_name: lead.owner.first_name, last_name: lead.owner.last_name } : null,
            campaign: lead.campaign,
          }}
          users={users}
          campaigns={campaigns}
          onClose={() => setIsEditing(false)}
        />
      )}

      {/* Convert Modal */}
      {isConverting && (
        <ConvertLeadModal
          lead={lead}
          onClose={() => setIsConverting(false)}
        />
      )}

      {/* Enroll in Campaign Modal */}
      {isEnrolling && (
        <EnrollLeadModal
          leadId={lead.id}
          leadName={`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Lead'}
          leadEmail={lead.email}
          onClose={() => setIsEnrolling(false)}
          onSuccess={() => {
            setIsEnrolling(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}
