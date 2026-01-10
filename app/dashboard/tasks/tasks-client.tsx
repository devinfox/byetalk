'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Sparkles,
  Filter,
  X,
  Phone,
  Target,
  User as UserIcon,
  ListTodo,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { Task, Lead, Deal, User } from '@/types/database.types'

interface TaskWithRelations extends Task {
  assigned_by_user: Pick<User, 'id' | 'first_name' | 'last_name'> | null
  lead: Pick<Lead, 'id' | 'first_name' | 'last_name'> | null
  deal: Pick<Deal, 'id' | 'name'> | null
  call: { id: string; to_number: string; started_at: string } | null
}

interface TasksClientProps {
  tasks: TaskWithRelations[]
  leads: Pick<Lead, 'id' | 'first_name' | 'last_name'>[]
  deals: Pick<Deal, 'id' | 'name'>[]
  users: Pick<User, 'id' | 'first_name' | 'last_name'>[]
  currentUser: User
  stats: {
    pending: number
    overdue: number
    completedToday: number
    aiGenerated: number
  }
}

const priorityLabels = ['', 'Critical', 'High', 'Normal', 'Low', 'Lowest']
const priorityColors = ['', 'text-red-400', 'text-orange-400', 'text-blue-400', 'text-gray-400', 'text-gray-500']

export function TasksClient({
  tasks,
  leads,
  deals,
  users,
  currentUser,
  stats,
}: TasksClientProps) {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'overdue' | 'ai'>('pending')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (filter === 'pending') return task.status === 'pending'
    if (filter === 'completed') return task.status === 'completed'
    if (filter === 'overdue') {
      return task.status === 'pending' && task.due_at && new Date(task.due_at) < new Date()
    }
    if (filter === 'ai') return task.source === 'ai_call_analysis'
    return true
  })

  // Toggle task completion
  const toggleTask = async (task: TaskWithRelations) => {
    setLoading(task.id)
    const supabase = createClient()

    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString()
      updates.completed_by = currentUser.id
    } else {
      updates.completed_at = null
      updates.completed_by = null
    }

    await supabase.from('tasks').update(updates).eq('id', task.id)

    setLoading(null)
    router.refresh()
  }

  // Format due date with time
  const formatDueDate = (dueAt: string | null) => {
    if (!dueAt) return null

    const due = new Date(dueAt)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))
    const diffMins = Math.ceil(diffMs / (1000 * 60))

    // Format time in user's locale
    const timeStr = due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

    if (diffMs < 0) {
      if (diffDays === 0 || diffDays === -1) {
        return { text: `Overdue (was ${timeStr})`, color: 'text-red-400' }
      }
      return { text: `${Math.abs(diffDays)}d overdue`, color: 'text-red-400' }
    }
    if (diffMins <= 60) return { text: `Due in ${diffMins}m at ${timeStr}`, color: 'text-red-400' }
    if (diffHours <= 3) return { text: `Due in ${diffHours}h at ${timeStr}`, color: 'text-orange-400' }
    if (diffDays === 0) return { text: `Due today at ${timeStr}`, color: 'text-yellow-400' }
    if (diffDays === 1) return { text: `Due tomorrow at ${timeStr}`, color: 'text-blue-400' }
    return { text: `${due.toLocaleDateString()} at ${timeStr}`, color: 'text-gray-400' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            MANAGE <span className="text-gold-gradient font-semibold">TASKS</span>
          </h1>
          <p className="text-gray-400 mt-1">Manage your tasks and follow-ups</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 glass-button-gold rounded-xl text-sm font-medium transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          icon={Circle}
          color="blue"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          label="Completed Today"
          value={stats.completedToday}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label="AI Generated"
          value={stats.aiGenerated}
          icon={Sparkles}
          color="purple"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-yellow-400" />
        {(['all', 'pending', 'completed', 'overdue', 'ai'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? 'glass-button-gold'
                : 'glass-button text-gray-300 hover:text-white'
            }`}
          >
            {f === 'ai' ? 'AI Generated' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="glass-card">
        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
              <ListTodo className="w-8 h-8 opacity-50" />
            </div>
            <p>No tasks found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredTasks.map((task) => {
              const dueInfo = formatDueDate(task.due_at)
              const isOverdue = task.status === 'pending' && task.due_at && new Date(task.due_at) < new Date()

              return (
                <div
                  key={task.id}
                  className={`p-5 hover:bg-white/5 transition-colors ${
                    task.status === 'completed' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleTask(task)}
                      disabled={loading === task.id}
                      className={`mt-0.5 transition-all ${
                        loading === task.id ? 'opacity-50' : ''
                      }`}
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : (
                        <Circle
                          className={`w-5 h-5 ${
                            isOverdue ? 'text-red-400' : 'text-gray-400 hover:text-yellow-400'
                          }`}
                        />
                      )}
                    </button>

                    {/* Task Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className={`font-medium ${
                            task.status === 'completed'
                              ? 'text-gray-400 line-through'
                              : 'text-white'
                          }`}
                        >
                          {task.title}
                        </h3>

                        {/* AI Badge */}
                        {task.source === 'ai_call_analysis' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs border border-purple-500/30">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}

                        {/* Priority */}
                        {task.priority && task.priority !== 3 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            task.priority === 1 ? 'bg-red-500/20 border-red-500/30 text-red-400' :
                            task.priority === 2 ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' :
                            'bg-gray-500/20 border-gray-500/30 text-gray-400'
                          }`}>
                            {priorityLabels[task.priority]}
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      {/* Meta info */}
                      <div className="flex items-center flex-wrap gap-3 mt-2.5 text-xs text-gray-500">
                        {dueInfo && (
                          <span className={`flex items-center gap-1 ${dueInfo.color}`}>
                            <Clock className="w-3 h-3" />
                            {dueInfo.text}
                          </span>
                        )}

                        {task.lead && (
                          <Link
                            href={`/dashboard/leads/${task.lead.id}`}
                            className="flex items-center gap-1 text-yellow-400/80 hover:text-yellow-400 transition-colors"
                          >
                            <UserIcon className="w-3 h-3" />
                            {task.lead.first_name} {task.lead.last_name}
                          </Link>
                        )}

                        {task.deal && (
                          <span className="flex items-center gap-1 text-yellow-400/70">
                            <Target className="w-3 h-3" />
                            {task.deal.name}
                          </span>
                        )}

                        {task.call && (
                          <span className="flex items-center gap-1 text-green-400/70">
                            <Phone className="w-3 h-3" />
                            From call
                          </span>
                        )}

                        {task.task_type && (
                          <span className="capitalize px-2 py-0.5 bg-white/5 rounded-full">
                            {task.task_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {isCreateOpen && (
        <CreateTaskModal
          leads={leads}
          deals={deals}
          users={users}
          currentUser={currentUser}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'red' | 'green' | 'purple'
}) {
  const iconColors = {
    blue: 'text-blue-400',
    red: 'text-red-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
  }

  const bgColors = {
    blue: 'bg-blue-500/20',
    red: 'bg-red-500/20',
    green: 'bg-green-500/20',
    purple: 'bg-purple-500/20',
  }

  return (
    <div className="glass-card p-5 text-center">
      <div className="flex items-center justify-center mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColors[color]}`}>
          <Icon className={`w-5 h-5 ${iconColors[color]}`} />
        </div>
      </div>
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  )
}

function CreateTaskModal({
  leads,
  deals,
  users,
  currentUser,
  onClose,
}: {
  leads: Pick<Lead, 'id' | 'first_name' | 'last_name'>[]
  deals: Pick<Deal, 'id' | 'name'>[]
  users: Pick<User, 'id' | 'first_name' | 'last_name'>[]
  currentUser: User
  onClose: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: currentUser.id,
    lead_id: '',
    deal_id: '',
    due_at: '',
    priority: '3',
    task_type: 'follow_up',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.title.trim()) {
      setError('Title is required')
      setLoading(false)
      return
    }

    const supabase = createClient()

    const { error: insertError } = await supabase.from('tasks').insert({
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      assigned_to: formData.assigned_to || currentUser.id,
      assigned_by: currentUser.id,
      lead_id: formData.lead_id || null,
      deal_id: formData.deal_id || null,
      due_at: formData.due_at ? new Date(formData.due_at).toISOString() : null,
      priority: parseInt(formData.priority),
      task_type: formData.task_type,
      source: 'manual',
      status: 'pending',
    })

    if (insertError) {
      setError(insertError.message)
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
          <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Create Task</h2>
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
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="glass-input w-full px-3 py-2"
              placeholder="Call back John Smith"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="glass-input w-full px-3 py-2"
              placeholder="Details about this task..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Due Date
              </label>
              <input
                type="datetime-local"
                value={formData.due_at}
                onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
                className="glass-input w-full px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="glass-select w-full"
              >
                <option value="1">Critical</option>
                <option value="2">High</option>
                <option value="3">Normal</option>
                <option value="4">Low</option>
                <option value="5">Lowest</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Task Type
              </label>
              <select
                value={formData.task_type}
                onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
                className="glass-select w-full"
              >
                <option value="follow_up">Follow Up</option>
                <option value="call_back">Call Back</option>
                <option value="send_docs">Send Documents</option>
                <option value="review">Review</option>
                <option value="other">Other</option>
              </select>
            </div>

            {users.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                  Assign To
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="glass-select w-full"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Lead
              </label>
              <select
                value={formData.lead_id}
                onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                className="glass-select w-full"
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
              <label className="block text-sm font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Deal
              </label>
              <select
                value={formData.deal_id}
                onChange={(e) => setFormData({ ...formData, deal_id: e.target.value })}
                className="glass-select w-full"
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
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
