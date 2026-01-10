'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CallButton } from '@/components/call-button'
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  User,
  Pencil,
  Trash2,
  DollarSign,
  Plus,
  Clock,
  CheckCircle,
  Circle,
  MessageSquare,
  Activity,
  TrendingUp,
  Award,
  ArrowRight,
  XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EditDealModal } from '../edit-deal-modal'
import type {
  Deal,
  User as UserType,
  Campaign,
  Note,
  Task,
  ActivityLog,
  DealStageHistory,
  FundingEvent,
  DealStage,
} from '@/types/database.types'

interface DealWithRelations extends Deal {
  owner: { id: string; first_name: string; last_name: string; email: string } | null
  secondary_owner: { id: string; first_name: string; last_name: string } | null
  lead: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null
  campaign: { id: string; name: string; code: string | null } | null
}

interface DealDetailViewProps {
  deal: DealWithRelations
  stageHistory: (DealStageHistory & { changed_by_user: { id: string; first_name: string; last_name: string } | null })[]
  activities: ActivityLog[]
  notes: (Note & { author: { id: string; first_name: string; last_name: string } | null })[]
  tasks: (Task & { assignee: { id: string; first_name: string; last_name: string } | null })[]
  fundingEvents: FundingEvent[]
  users: Pick<UserType, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  currentUser: UserType | null
}

const PIPELINE_STAGES: { key: DealStage; label: string; color: string; dotColor: string }[] = [
  { key: 'deal_opened', label: 'Opened', color: 'from-blue-500/20 to-blue-600/10', dotColor: 'bg-blue-400' },
  { key: 'proposal_education', label: 'Proposal', color: 'from-purple-500/20 to-purple-600/10', dotColor: 'bg-purple-400' },
  { key: 'paperwork_sent', label: 'Paperwork Sent', color: 'from-amber-500/20 to-amber-600/10', dotColor: 'bg-amber-400' },
  { key: 'paperwork_complete', label: 'Paperwork Done', color: 'from-emerald-500/20 to-emerald-600/10', dotColor: 'bg-emerald-400' },
  { key: 'funding_in_progress', label: 'Funding', color: 'from-yellow-500/20 to-yellow-600/10', dotColor: 'bg-yellow-400' },
]

export function DealDetailView({
  deal,
  stageHistory,
  activities,
  notes,
  tasks,
  fundingEvents,
  users,
  campaigns,
  currentUser,
}: DealDetailViewProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'notes' | 'tasks' | 'financials'>('activity')
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', due_at: '' })
  const [addingTask, setAddingTask] = useState(false)

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this deal?')) return

    const supabase = createClient()
    await supabase
      .from('deals')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', deal.id)

    router.push('/dashboard/deals')
  }

  const handleStageChange = async (newStage: DealStage) => {
    const supabase = createClient()
    await supabase
      .from('deals')
      .update({
        stage: newStage,
        stage_entered_at: new Date().toISOString(),
      })
      .eq('id', deal.id)

    router.refresh()
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setAddingNote(true)

    const supabase = createClient()
    await supabase.from('notes').insert({
      entity_type: 'deal',
      entity_id: deal.id,
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
      entity_type: 'deal',
      entity_id: deal.id,
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

  const currentStageIndex = PIPELINE_STAGES.findIndex(s => s.key === deal.stage)
  const isClosedWon = deal.stage === 'closed_won'
  const isClosedLost = deal.stage === 'closed_lost'
  const isClosed = isClosedWon || isClosedLost

  const stageColorClass = isClosedWon
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : isClosedLost
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/deals"
              className="p-2 text-gray-400 hover:text-yellow-400 rounded-xl hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-light text-white tracking-wide">
                  {deal.name.split(' ').map((word, i) => (
                    <span key={i} className={i === 0 ? '' : 'text-gold-gradient font-semibold'}>{word} </span>
                  ))}
                </h1>
                <span className={`px-3 py-1 rounded-xl border text-sm font-medium uppercase tracking-wide ${stageColorClass}`}>
                  {isClosed ? (isClosedWon ? 'Won' : 'Lost') : deal.stage.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-gray-400 mt-1">
                Deal #{deal.deal_number} - Created {formatDate(deal.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 glass-button rounded-xl text-sm font-medium transition-all hover:bg-white/10"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Pipeline Progress */}
        {!isClosed && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium uppercase tracking-wide">Pipeline Progress</h3>
              {currentStageIndex < PIPELINE_STAGES.length - 1 && (
                <button
                  onClick={() => handleStageChange(PIPELINE_STAGES[currentStageIndex + 1].key)}
                  className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-xl text-sm transition-all"
                >
                  <ArrowRight className="w-4 h-4" />
                  Move to {PIPELINE_STAGES[currentStageIndex + 1].label}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {PIPELINE_STAGES.map((stage, index) => {
                const isActive = index === currentStageIndex
                const isPast = index < currentStageIndex
                return (
                  <button
                    key={stage.key}
                    onClick={() => handleStageChange(stage.key)}
                    className={`flex-1 h-3 rounded-full transition-all duration-300 ${
                      isActive ? `bg-gradient-to-r ${stage.color} border border-white/20` : isPast ? 'bg-green-500' : 'bg-white/10'
                    }`}
                    title={stage.label}
                  />
                )
              })}
            </div>
            <div className="flex justify-between mt-3 text-xs text-gray-500 uppercase tracking-wide">
              <span>Deal Opened</span>
              <span>Funding In Progress</span>
            </div>
          </div>
        )}

        {/* Closed Status */}
        {isClosed && (
          <div className={`glass-card p-5 ${isClosedWon ? 'border-green-500/30' : 'border-red-500/30'}`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${isClosedWon ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {isClosedWon ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400" />
                )}
              </div>
              <div>
                <p className={`font-medium text-lg ${isClosedWon ? 'text-green-400' : 'text-red-400'}`}>
                  {isClosedWon ? 'Deal Closed - Won!' : 'Deal Closed - Lost'}
                </p>
                {isClosedWon && deal.closed_at && (
                  <p className="text-gray-400 text-sm">Closed on {formatDate(deal.closed_at)}</p>
                )}
                {isClosedLost && (
                  <p className="text-gray-400 text-sm">
                    {deal.lost_reason && `Reason: ${deal.lost_reason}`}
                    {deal.closed_lost_at && ` - ${formatDate(deal.closed_lost_at)}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Deal Details */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Deal Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 glass-card-subtle p-3 rounded-xl">
                  <div className="p-2.5 bg-blue-500/20 rounded-xl">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wide">Deal Type</p>
                    <p className="text-white capitalize">{deal.deal_type.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                {deal.ira_type && (
                  <div className="flex items-center gap-3 glass-card-subtle p-3 rounded-xl">
                    <div className="p-2.5 bg-purple-500/20 rounded-xl">
                      <Award className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">IRA Type</p>
                      <p className="text-white">{deal.ira_type} IRA</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 glass-card-subtle p-3 rounded-xl">
                  <div className="p-2.5 bg-yellow-500/20 rounded-xl">
                    <DollarSign className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wide">Estimated Value</p>
                    <p className="text-gold-gradient font-bold text-lg">{formatCurrency(deal.estimated_value || 0)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 glass-card-subtle p-3 rounded-xl">
                  <div className="p-2.5 bg-green-500/20 rounded-xl">
                    <DollarSign className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wide">Funded Amount</p>
                    <p className="text-green-400 font-bold text-lg">{formatCurrency(deal.funded_amount || 0)}</p>
                  </div>
                </div>
                {deal.owner && (
                  <div className="flex items-center gap-3 glass-card-subtle p-3 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm">
                      {deal.owner.first_name[0]}{deal.owner.last_name[0]}
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs uppercase tracking-wide">Owner</p>
                      <p className="text-white">{deal.owner.first_name} {deal.owner.last_name}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 glass-card-subtle p-3 rounded-xl">
                  <div className="p-2.5 bg-white/10 rounded-xl">
                    <Calendar className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wide">Created</p>
                    <p className="text-white">{formatDateTime(deal.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Lead Info */}
            {deal.lead && (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Lead</h2>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-lg">
                    {deal.lead.first_name[0]}{deal.lead.last_name[0]}
                  </div>
                  <div className="flex-1">
                    <Link
                      href={`/dashboard/leads/${deal.lead.id}`}
                      className="text-white font-medium text-lg hover:text-yellow-400 transition-colors"
                    >
                      {deal.lead.first_name} {deal.lead.last_name}
                    </Link>
                    <div className="flex items-center gap-4 mt-2">
                      {deal.lead.email && (
                        <a
                          href={`mailto:${deal.lead.email}`}
                          className="flex items-center gap-2 text-gray-400 hover:text-yellow-400 text-sm transition-colors"
                        >
                          <Mail className="w-4 h-4" />
                          {deal.lead.email}
                        </a>
                      )}
                      {deal.lead.phone && (
                        <CallButton
                          phone={deal.lead.phone}
                          leadId={deal.lead.id}
                          entityName={`${deal.lead.first_name} ${deal.lead.last_name}`}
                          className="flex items-center gap-2 text-gray-400 hover:text-green-400 text-sm transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          {deal.lead.phone}
                        </CallButton>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Activity Tabs */}
            <div className="glass-card">
              <div className="border-b border-white/10">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-5 py-4 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'activity'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Activity className="w-4 h-4 inline mr-2" />
                    Activity
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`px-5 py-4 text-sm font-medium border-b-2 transition-all ${
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
                    className={`px-5 py-4 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'tasks'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    Tasks ({tasks.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('financials')}
                    className={`px-5 py-4 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'financials'
                        ? 'text-yellow-400 border-yellow-400'
                        : 'text-gray-400 border-transparent hover:text-white'
                    }`}
                  >
                    <DollarSign className="w-4 h-4 inline mr-2" />
                    Financials
                  </button>
                </div>
              </div>

              <div className="p-5">
                {activeTab === 'activity' && (
                  <div className="space-y-4">
                    {/* Stage History */}
                    {stageHistory.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-gray-400 text-sm font-medium uppercase tracking-wide">Stage History</h4>
                        {stageHistory.slice(0, 10).map((history) => (
                          <div key={history.id} className="flex gap-3 glass-card-subtle p-3 rounded-xl">
                            <div className="p-2 bg-yellow-500/20 rounded-xl h-fit">
                              <ArrowRight className="w-4 h-4 text-yellow-400" />
                            </div>
                            <div>
                              <p className="text-white text-sm">
                                Stage changed from <span className="text-gray-400">{history.from_stage?.replace(/_/g, ' ') || 'none'}</span> to{' '}
                                <span className="text-yellow-400 font-medium">{history.to_stage.replace(/_/g, ' ')}</span>
                              </p>
                              <p className="text-gray-500 text-xs mt-1">
                                {history.changed_by_user && `${history.changed_by_user.first_name} ${history.changed_by_user.last_name} • `}
                                {formatDateTime(history.created_at)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {activities.length === 0 && stageHistory.length === 0 && (
                      <p className="text-gray-500 text-center py-8">No activity recorded yet</p>
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a note..."
                        className="glass-input flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={addingNote || !newNote.trim()}
                        className="px-4 py-2 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
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
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        placeholder="Add a task..."
                        className="glass-input flex-1"
                      />
                      <input
                        type="date"
                        value={newTask.due_at}
                        onChange={(e) => setNewTask({ ...newTask, due_at: e.target.value })}
                        className="glass-input"
                      />
                      <button
                        onClick={handleAddTask}
                        disabled={addingTask || !newTask.title.trim()}
                        className="px-4 py-2 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 transition-all"
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
                          className={`flex items-center gap-3 p-3 rounded-xl ${
                            task.status === 'completed' ? 'glass-card-subtle opacity-60' : 'glass-card-subtle'
                          }`}
                        >
                          <button
                            onClick={() => handleToggleTask(task.id, task.status)}
                            className="text-gray-400 hover:text-yellow-400 transition-colors"
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
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'financials' && (
                  <div className="space-y-6">
                    {/* Financial Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="glass-card-subtle rounded-xl p-4 text-center">
                        <p className="text-gray-400 text-xs uppercase tracking-wide">Estimated</p>
                        <p className="text-gold-gradient font-bold text-lg mt-1">{formatCurrency(deal.estimated_value || 0)}</p>
                      </div>
                      <div className="glass-card-subtle rounded-xl p-4 text-center">
                        <p className="text-gray-400 text-xs uppercase tracking-wide">Funded</p>
                        <p className="text-green-400 font-bold text-lg mt-1">{formatCurrency(deal.funded_amount || 0)}</p>
                      </div>
                      <div className="glass-card-subtle rounded-xl p-4 text-center">
                        <p className="text-gray-400 text-xs uppercase tracking-wide">Gross Revenue</p>
                        <p className="text-white font-bold text-lg mt-1">{formatCurrency(deal.gross_revenue || 0)}</p>
                      </div>
                    </div>

                    {/* Funding Events */}
                    {fundingEvents.length > 0 && (
                      <div>
                        <h4 className="text-gray-400 text-sm font-medium mb-3 uppercase tracking-wide">Funding Events</h4>
                        <div className="space-y-2">
                          {fundingEvents.map((event) => (
                            <div key={event.id} className="flex items-center justify-between glass-card-subtle rounded-xl p-3">
                              <div>
                                <p className="text-white text-sm capitalize">{event.transaction_type.replace(/_/g, ' ')}</p>
                                <p className="text-gray-500 text-xs">{formatDate(event.transaction_date)}</p>
                              </div>
                              <p className={`font-medium ${event.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatCurrency(event.amount)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {fundingEvents.length === 0 && (
                      <p className="text-gray-500 text-center py-8">No financial data yet</p>
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
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Days in Pipeline</p>
                  <p className="text-3xl font-bold text-gold-gradient mt-1">
                    {Math.floor((Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24))}
                  </p>
                </div>
                <div className="glass-card-subtle p-4 rounded-xl text-center">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Days in Current Stage</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))}
                  </p>
                </div>
                <div className="glass-card-subtle p-4 rounded-xl text-center">
                  <p className="text-gray-400 text-xs uppercase tracking-wide">Open Tasks</p>
                  <p className="text-3xl font-bold text-white mt-1">
                    {tasks.filter(t => t.status !== 'completed').length}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            {deal.lead && (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Quick Actions</h2>
                <div className="space-y-2">
                  {deal.lead.phone && (
                    <CallButton
                      phone={deal.lead.phone}
                      leadId={deal.lead.id}
                      entityName={`${deal.lead.first_name} ${deal.lead.last_name}`}
                      className="flex items-center gap-3 w-full px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-xl transition-all"
                    >
                      <Phone className="w-4 h-4" />
                      Call Lead
                    </CallButton>
                  )}
                  {deal.lead.email && (
                    <a
                      href={`mailto:${deal.lead.email}`}
                      className="flex items-center gap-3 w-full px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-xl transition-all"
                    >
                      <Mail className="w-4 h-4" />
                      Send Email
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Close Actions */}
            {!isClosed && (
              <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4 uppercase tracking-wide">Close Deal</h2>
                <div className="space-y-3">
                  <button
                    onClick={() => handleStageChange('closed_won')}
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-xl font-medium transition-all shadow-lg shadow-green-500/20"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Mark as Won
                  </button>
                  <button
                    onClick={() => handleStageChange('closed_lost')}
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl font-medium transition-all"
                  >
                    <XCircle className="w-5 h-5" />
                    Mark as Lost
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <EditDealModal
          deal={{
            ...deal,
            owner: deal.owner ? { id: deal.owner.id, first_name: deal.owner.first_name, last_name: deal.owner.last_name } : null,
            campaign: deal.campaign,
          }}
          users={users}
          campaigns={campaigns}
          onClose={() => setIsEditing(false)}
        />
      )}
    </>
  )
}
