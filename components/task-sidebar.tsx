'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clock, Phone, FileText, Mail, Circle, CheckCircle2, AlertTriangle, ListTodo, User } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Task {
  id: string
  title: string
  description: string | null
  task_type: string
  due_at: string
  status: string
  priority: number
  lead_id: string | null
  contact_id: string | null
  deal_id: string | null
  lead?: {
    id: string
    first_name: string | null
    last_name: string | null
  } | null
  contact?: {
    id: string
    first_name: string | null
    last_name: string | null
  } | null
}

interface GroupedTasks {
  date: string
  label: string
  tasks: Task[]
}

export function TaskSidebar({ userId }: { userId?: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  const fetchTasks = useCallback(async () => {
    if (!userId) return

    const supabase = createClient()

    const { data } = await supabase
      .from('tasks')
      .select(`
        id, title, description, task_type, due_at, status, priority, lead_id, contact_id, deal_id,
        lead:leads(id, first_name, last_name),
        contact:contacts(id, first_name, last_name)
      `)
      .eq('assigned_to', userId)
      .eq('status', 'pending')
      .eq('is_deleted', false)
      .order('due_at', { ascending: true })
      .limit(50)

    if (data) {
      // Transform data - Supabase returns joined relations as arrays
      const transformedData = data.map((task: any) => ({
        ...task,
        lead: Array.isArray(task.lead) ? task.lead[0] || null : task.lead,
        contact: Array.isArray(task.contact) ? task.contact[0] || null : task.contact,
      }))
      setTasks(transformedData)
    }
    setLoading(false)
  }, [userId])

  // Fetch tasks on mount and every 30 seconds
  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  // Update "now" every 30 seconds to recalculate urgency
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  const markComplete = async (taskId: string) => {
    const supabase = createClient()
    await supabase
      .from('tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', taskId)

    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'call_back':
      case 'follow_up':
        return <Phone className="w-3.5 h-3.5" />
      case 'send_docs':
        return <FileText className="w-3.5 h-3.5" />
      case 'email':
        return <Mail className="w-3.5 h-3.5" />
      default:
        return <Circle className="w-3.5 h-3.5" />
    }
  }

  const getEntityLink = (task: Task) => {
    if (task.lead_id) return `/dashboard/leads/${task.lead_id}`
    if (task.contact_id) return `/dashboard/contacts/${task.contact_id}`
    if (task.deal_id) return `/dashboard/deals/${task.deal_id}`
    return '/dashboard/tasks'
  }

  const getPersonInfo = (task: Task): { name: string; link: string | null; type: 'lead' | 'contact' | null } => {
    if (task.lead && (task.lead.first_name || task.lead.last_name)) {
      const name = `${task.lead.first_name || ''} ${task.lead.last_name || ''}`.trim()
      return { name, link: `/dashboard/leads/${task.lead.id}`, type: 'lead' }
    }
    if (task.contact && (task.contact.first_name || task.contact.last_name)) {
      const name = `${task.contact.first_name || ''} ${task.contact.last_name || ''}`.trim()
      return { name, link: `/dashboard/contacts/${task.contact.id}`, type: 'contact' }
    }
    return { name: '', link: null, type: null }
  }

  const getMinutesUntilDue = (dueAt: string) => {
    const dueTime = new Date(dueAt)
    return Math.round((dueTime.getTime() - now.getTime()) / (60 * 1000))
  }

  const formatTime = (dueAt: string) => {
    const dueTime = new Date(dueAt)
    return dueTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const getDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())

    if (dateOnly.getTime() === todayOnly.getTime()) return 'Today'
    if (dateOnly.getTime() === tomorrowOnly.getTime()) return 'Tomorrow'
    if (dateOnly.getTime() === yesterdayOnly.getTime()) return 'Yesterday'
    if (dateOnly < todayOnly) return 'Overdue'

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const getDateKey = (dueAt: string): string => {
    const date = new Date(dueAt)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  // Group tasks by date
  const groupedTasks: GroupedTasks[] = (() => {
    const groups: Record<string, Task[]> = {}
    const today = new Date()
    const todayKey = getDateKey(today.toISOString())

    // First, separate overdue tasks
    const overdueTasks: Task[] = []
    const futureTasks: Task[] = []

    tasks.forEach((task) => {
      const taskDateKey = getDateKey(task.due_at)
      const taskDate = new Date(task.due_at)
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

      if (taskDate < todayStart) {
        overdueTasks.push(task)
      } else {
        futureTasks.push(task)
      }
    })

    // Group future tasks by date
    futureTasks.forEach((task) => {
      const key = getDateKey(task.due_at)
      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    })

    // Build result array
    const result: GroupedTasks[] = []

    // Add overdue group first if any
    if (overdueTasks.length > 0) {
      result.push({
        date: 'overdue',
        label: 'Overdue',
        tasks: overdueTasks,
      })
    }

    // Add other groups sorted by date
    Object.keys(groups)
      .sort()
      .forEach((dateKey) => {
        result.push({
          date: dateKey,
          label: getDateLabel(groups[dateKey][0].due_at),
          tasks: groups[dateKey],
        })
      })

    return result
  })()

  if (!userId) return null

  return (
    <div className="w-72 flex-shrink-0 flex flex-col h-full relative z-10 p-4 pl-0">
      <div className="glass-card flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Tasks</h2>
            <span className="ml-auto text-xs text-gray-400 bg-white/10 px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groupedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <CheckCircle2 className="w-8 h-8 text-green-400/50 mb-2" />
              <p className="text-gray-500 text-sm">All caught up!</p>
              <p className="text-gray-600 text-xs">No pending tasks</p>
            </div>
          ) : (
            groupedTasks.map((group) => (
              <div key={group.date}>
                {/* Date Header */}
                <div className={`flex items-center gap-2 mb-2 px-1 ${
                  group.label === 'Overdue' ? 'text-red-400' :
                  group.label === 'Today' ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  <div className={`h-px flex-1 ${
                    group.label === 'Overdue' ? 'bg-red-500/30' :
                    group.label === 'Today' ? 'bg-yellow-500/30' : 'bg-white/10'
                  }`} />
                  <span className="text-xs font-medium uppercase tracking-wider">{group.label}</span>
                  <div className={`h-px flex-1 ${
                    group.label === 'Overdue' ? 'bg-red-500/30' :
                    group.label === 'Today' ? 'bg-yellow-500/30' : 'bg-white/10'
                  }`} />
                </div>

                {/* Tasks for this date */}
                <div className="space-y-2">
                  {group.tasks.map((task) => {
                    const minutesUntilDue = getMinutesUntilDue(task.due_at)
                    const isUrgent = minutesUntilDue <= 10 && minutesUntilDue >= 0
                    const isOverdue = minutesUntilDue < 0

                    return (
                      <div
                        key={task.id}
                        className={`glass-card-subtle p-3 transition-all ${
                          isUrgent
                            ? 'border-red-500/50 bg-red-500/10 animate-urgent-bounce'
                            : isOverdue
                            ? 'border-red-500/30 bg-red-500/5'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Urgent Banner */}
                        {isUrgent && (
                          <div className="flex items-center gap-1.5 mb-2 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs font-bold text-red-400 uppercase tracking-wide">
                              {minutesUntilDue} MINS TIL DUE
                            </span>
                          </div>
                        )}

                        {/* Task Header */}
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => markComplete(task.id)}
                            className="mt-0.5 p-1 rounded hover:bg-white/10 text-gray-400 hover:text-green-400 transition-colors flex-shrink-0"
                            title="Mark complete"
                          >
                            <Circle className="w-4 h-4" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <Link
                              href={getEntityLink(task)}
                              className="text-sm text-white hover:text-yellow-400 font-medium line-clamp-2 transition-colors"
                            >
                              {task.title}
                            </Link>
                          </div>
                        </div>

                        {/* Task Footer */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                          <div className="flex items-center gap-1.5 text-gray-400">
                            {getTaskTypeIcon(task.task_type)}
                            <span className="text-xs capitalize">{task.task_type?.replace(/_/g, ' ')}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${
                            isOverdue ? 'text-red-400' : isUrgent ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(task.due_at)}</span>
                          </div>
                        </div>

                        {/* Lead/Contact Info */}
                        {(() => {
                          const personInfo = getPersonInfo(task)
                          if (!personInfo.name) return null
                          return (
                            <div className="mt-2 pt-2 border-t border-white/5">
                              {personInfo.link ? (
                                <Link
                                  href={personInfo.link}
                                  className="flex items-center gap-1.5 text-xs text-yellow-400/80 hover:text-yellow-400 transition-colors"
                                >
                                  <User className="w-3 h-3" />
                                  <span>{personInfo.name}</span>
                                  <span className="text-gray-500">({personInfo.type})</span>
                                </Link>
                              ) : (
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                  <User className="w-3 h-3" />
                                  <span>{personInfo.name}</span>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Link */}
        <div className="px-4 py-3 border-t border-white/10">
          <Link
            href="/dashboard/tasks"
            className="block text-center text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            View All Tasks
          </Link>
        </div>
      </div>

      <style jsx>{`
        @keyframes urgent-bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
        .animate-urgent-bounce {
          animation: urgent-bounce 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
