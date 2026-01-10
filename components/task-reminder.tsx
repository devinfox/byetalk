'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Clock, AlertTriangle, Phone, FileText, Mail, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Task {
  id: string
  title: string
  description: string | null
  task_type: string
  due_at: string
  lead_id: string | null
  contact_id: string | null
  deal_id: string | null
}

interface Reminder {
  task: Task
  minutesUntilDue: number
  shownAt: Date
}

export function TaskReminder({ userId }: { userId?: string }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [dismissedTaskIds, setDismissedTaskIds] = useState<Set<string>>(new Set())

  const fetchUpcomingTasks = useCallback(async () => {
    if (!userId) return

    const supabase = createClient()
    const now = new Date()
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, description, task_type, due_at, lead_id, contact_id, deal_id')
      .eq('assigned_to', userId)
      .eq('status', 'pending')
      .eq('is_deleted', false)
      .gte('due_at', now.toISOString())
      .lte('due_at', fifteenMinutesFromNow.toISOString())
      .order('due_at', { ascending: true })

    if (tasks) {
      const newReminders: Reminder[] = []

      tasks.forEach((task) => {
        // Skip if already dismissed
        if (dismissedTaskIds.has(task.id)) return

        const dueTime = new Date(task.due_at)
        const minutesUntilDue = Math.round((dueTime.getTime() - now.getTime()) / (60 * 1000))

        // Show reminder if task is due within 10 minutes
        if (minutesUntilDue <= 10 && minutesUntilDue >= 0) {
          // Check if we already have a reminder for this task
          const existingReminder = reminders.find((r) => r.task.id === task.id)
          if (!existingReminder) {
            newReminders.push({
              task,
              minutesUntilDue,
              shownAt: new Date(),
            })
          }
        }
      })

      if (newReminders.length > 0) {
        setReminders((prev) => [...prev, ...newReminders])

        // Play notification sound
        playNotificationSound()

        // Request browser notification permission and show notification
        if (Notification.permission === 'granted') {
          newReminders.forEach((reminder) => {
            new Notification(`Task Due in ${reminder.minutesUntilDue} minutes!`, {
              body: reminder.task.title,
              icon: '/favicon.ico',
              tag: reminder.task.id,
            })
          })
        }
      }
    }
  }, [userId, dismissedTaskIds, reminders])

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Check for upcoming tasks every 30 seconds
  useEffect(() => {
    fetchUpcomingTasks()
    const interval = setInterval(fetchUpcomingTasks, 30000)
    return () => clearInterval(interval)
  }, [fetchUpcomingTasks])

  // Update minutes until due every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setReminders((prev) =>
        prev.map((reminder) => {
          const now = new Date()
          const dueTime = new Date(reminder.task.due_at)
          const minutesUntilDue = Math.round((dueTime.getTime() - now.getTime()) / (60 * 1000))
          return { ...reminder, minutesUntilDue }
        }).filter((reminder) => reminder.minutesUntilDue >= -5) // Keep for 5 minutes after due
      )
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const dismissReminder = (taskId: string) => {
    setDismissedTaskIds((prev) => new Set([...prev, taskId]))
    setReminders((prev) => prev.filter((r) => r.task.id !== taskId))
  }

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.value = 0.1

      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.2)

      setTimeout(() => {
        const osc2 = audioContext.createOscillator()
        osc2.connect(gainNode)
        osc2.frequency.value = 1000
        osc2.type = 'sine'
        osc2.start()
        osc2.stop(audioContext.currentTime + 0.2)
      }, 250)
    } catch {
      // Audio not supported
    }
  }

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'call_back':
      case 'follow_up':
        return <Phone className="w-5 h-5" />
      case 'send_docs':
        return <FileText className="w-5 h-5" />
      case 'email':
        return <Mail className="w-5 h-5" />
      default:
        return <Circle className="w-5 h-5" />
    }
  }

  const getEntityLink = (task: Task) => {
    if (task.lead_id) return `/dashboard/leads/${task.lead_id}`
    if (task.contact_id) return `/dashboard/contacts/${task.contact_id}`
    if (task.deal_id) return `/dashboard/deals/${task.deal_id}`
    return '/dashboard/tasks'
  }

  if (reminders.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-sm">
      {reminders.map((reminder) => (
        <div
          key={reminder.task.id}
          className={`bg-gray-800 border rounded-xl shadow-2xl p-4 animate-slide-in ${
            reminder.minutesUntilDue <= 0
              ? 'border-red-500 bg-red-500/10'
              : reminder.minutesUntilDue <= 5
              ? 'border-orange-500 bg-orange-500/10'
              : 'border-yellow-500 bg-yellow-500/10'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg ${
                reminder.minutesUntilDue <= 0
                  ? 'bg-red-500/20 text-red-400'
                  : reminder.minutesUntilDue <= 5
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm font-bold ${
                    reminder.minutesUntilDue <= 0
                      ? 'text-red-400'
                      : reminder.minutesUntilDue <= 5
                      ? 'text-orange-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {reminder.minutesUntilDue <= 0
                    ? 'TASK OVERDUE!'
                    : `${reminder.minutesUntilDue} MIN${reminder.minutesUntilDue !== 1 ? 'S' : ''} LEFT!`}
                </span>
                <button
                  onClick={() => dismissReminder(reminder.task.id)}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-gray-400">{getTaskTypeIcon(reminder.task.task_type)}</span>
                <span className="text-white font-medium truncate">{reminder.task.title}</span>
              </div>

              {reminder.task.description && (
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">
                  {reminder.task.description}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Link
                  href={getEntityLink(reminder.task)}
                  className="flex-1 text-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                >
                  View Details
                </Link>
                <button
                  onClick={() => dismissReminder(reminder.task.id)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
