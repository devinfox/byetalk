'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Circle,
  Phone,
  FileText,
  Mail,
  Calendar as CalendarIcon,
  Plus,
  X,
  Video,
  CheckSquare,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import Link from 'next/link'

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: number
  task_type: string
  due_at: string
  completed_at: string | null
  lead: { id: string; first_name: string; last_name: string }[] | { id: string; first_name: string; last_name: string } | null
  contact: { id: string; first_name: string; last_name: string }[] | { id: string; first_name: string; last_name: string } | null
  deal: { id: string; name: string }[] | { id: string; name: string } | null
}

interface CalendarViewProps {
  tasks: Task[]
  currentUser: { id: string; first_name: string; last_name: string; role: string; timezone?: string } | null
  userTimezone: string
}

// Helper to get the first item from array or the object itself
function getRelated<T>(data: T[] | T | null): T | null {
  if (!data) return null
  if (Array.isArray(data)) return data[0] || null
  return data
}

export function CalendarView({ tasks, currentUser, userTimezone }: CalendarViewProps) {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')

  // Modal state for adding events
  const [showAddModal, setShowAddModal] = useState(false)
  const [modalDate, setModalDate] = useState<Date | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newEvent, setNewEvent] = useState({
    type: 'task' as 'task' | 'call' | 'meeting',
    title: '',
    description: '',
    time: '09:00',
    priority: 3,
  })

  // Handle double-click to open add modal
  const handleDoubleClick = (day: Date) => {
    setModalDate(day)
    setNewEvent({
      type: 'task',
      title: '',
      description: '',
      time: '09:00',
      priority: 3,
    })
    setShowAddModal(true)
  }

  // Handle adding a new event
  const handleAddEvent = async () => {
    if (!modalDate || !newEvent.title.trim() || !currentUser) return

    setIsSubmitting(true)
    const supabase = createClient()

    try {
      // Combine date and time
      const [hours, minutes] = newEvent.time.split(':')
      const dueAt = new Date(modalDate)
      dueAt.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      // Map event type to task_type
      const taskTypeMap = {
        task: 'other',
        call: 'call_back',
        meeting: 'meeting',
      }

      await supabase.from('tasks').insert({
        title: newEvent.title,
        description: newEvent.description || null,
        task_type: taskTypeMap[newEvent.type],
        due_at: dueAt.toISOString(),
        priority: newEvent.priority,
        status: 'pending',
        assigned_to: currentUser.id,
        assigned_by: currentUser.id,
      })

      setShowAddModal(false)
      router.refresh()
    } catch (error) {
      console.error('Error adding event:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Group tasks by date - only include pending tasks (exclude completed)
  const tasksByDate = useMemo(() => {
    const grouped: Record<string, Task[]> = {}
    tasks
      .filter((task) => task.status !== 'completed') // Hide completed tasks entirely
      .forEach((task) => {
        const dateKey = format(toZonedTime(parseISO(task.due_at), userTimezone), 'yyyy-MM-dd')
        if (!grouped[dateKey]) {
          grouped[dateKey] = []
        }
        grouped[dateKey].push(task)
      })
    return grouped
  }, [tasks, userTimezone])

  // Get tasks for selected date
  const selectedDateTasks = useMemo(() => {
    if (!selectedDate) return []
    const dateKey = format(selectedDate, 'yyyy-MM-dd')
    return tasksByDate[dateKey] || []
  }, [selectedDate, tasksByDate])

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const startDate = startOfWeek(monthStart)
    const endDate = endOfWeek(monthEnd)

    const days: Date[] = []
    let day = startDate
    while (day <= endDate) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentDate])

  // Week view days
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate)
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i))
    }
    return days
  }, [currentDate])

  const navigatePrev = () => {
    if (view === 'month') {
      setCurrentDate(subMonths(currentDate, 1))
    } else {
      setCurrentDate(addDays(currentDate, -7))
    }
  }

  const navigateNext = () => {
    if (view === 'month') {
      setCurrentDate(addMonths(currentDate, 1))
    } else {
      setCurrentDate(addDays(currentDate, 7))
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
  }

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'call_back':
      case 'follow_up':
        return <Phone className="w-3 h-3" />
      case 'send_docs':
        return <FileText className="w-3 h-3" />
      case 'email':
        return <Mail className="w-3 h-3" />
      default:
        return <Circle className="w-3 h-3" />
    }
  }

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1:
        return 'bg-red-500'
      case 2:
        return 'bg-orange-500'
      case 3:
        return 'bg-yellow-500'
      case 4:
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  const formatTimeInUserTimezone = (dateStr: string) => {
    return formatInTimeZone(parseISO(dateStr), userTimezone, 'h:mm a')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            <span className="text-gold-gradient font-semibold">CALENDAR</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Timezone: {userTimezone.replace('_', ' ')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex glass-card p-1 rounded-xl">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                view === 'month'
                  ? 'glass-button-gold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${
                view === 'week'
                  ? 'glass-button-gold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Week
            </button>
          </div>
          <button
            onClick={goToToday}
            className="px-4 py-2 text-sm glass-button rounded-xl text-gray-300 hover:text-white transition-all"
          >
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 glass-card p-5">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={navigatePrev}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-yellow-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide">
              {view === 'month'
                ? format(currentDate, 'MMMM yyyy')
                : `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`}
            </h2>
            <button
              onClick={navigateNext}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-yellow-400"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-gray-400 py-2 uppercase tracking-wide"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          {view === 'month' ? (
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate[dateKey] || []
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const isCurrentMonth = isSameMonth(day, currentDate)

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    onDoubleClick={() => handleDoubleClick(day)}
                    className={`min-h-[80px] p-1.5 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-yellow-500/20 border border-yellow-500/50'
                        : 'hover:bg-white/5'
                    } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  >
                    <div
                      className={`text-sm font-medium mb-1 ${
                        isToday(day)
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black w-6 h-6 rounded-full flex items-center justify-center'
                          : 'text-gray-300 px-1'
                      }`}
                    >
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((task) => (
                        <div
                          key={task.id}
                          className={`text-xs px-1.5 py-0.5 rounded truncate ${getPriorityColor(task.priority)}/20 text-gray-300`}
                        >
                          {formatTimeInUserTimezone(task.due_at)} {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">
                          +{dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            /* Week View */
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, index) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayTasks = tasksByDate[dateKey] || []
                const isSelected = selectedDate && isSameDay(day, selectedDate)

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(day)}
                    onDoubleClick={() => handleDoubleClick(day)}
                    className={`min-h-[300px] p-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-yellow-500/20 border border-yellow-500/50'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`text-sm font-medium mb-2 ${
                        isToday(day)
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black px-2 py-1 rounded-lg inline-block'
                          : 'text-gray-300'
                      }`}
                    >
                      {format(day, 'EEE d')}
                    </div>
                    <div className="space-y-1">
                      {dayTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`text-xs p-1.5 rounded-lg ${getPriorityColor(task.priority)}/20 text-gray-300`}
                        >
                          <div className="font-medium truncate">
                            {formatTimeInUserTimezone(task.due_at)}
                          </div>
                          <div className="truncate">{task.title}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Day Tasks */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2 uppercase tracking-wide">
            <div className="w-8 h-8 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-yellow-400" />
            </div>
            {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}
          </h3>

          {selectedDateTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                <CalendarIcon className="w-8 h-8 opacity-50" />
              </div>
              <p>No tasks scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateTasks
                .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
                .map((task) => (
                  <div
                    key={task.id}
                    className="glass-card-subtle p-4 rounded-xl"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-gray-400">
                        {getTaskTypeIcon(task.task_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white">
                            {task.title}
                          </span>
                          <span className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimeInUserTimezone(task.due_at)}</span>
                        </div>

                        {task.description && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        {/* Related Entity */}
                        {(task.lead || task.contact || task.deal) && (
                          <div className="text-xs">
                            {(() => {
                              const lead = getRelated(task.lead)
                              return lead && (
                                <Link
                                  href={`/dashboard/leads/${lead.id}`}
                                  className="text-yellow-400 hover:underline"
                                >
                                  Lead: {lead.first_name} {lead.last_name}
                                </Link>
                              )
                            })()}
                            {(() => {
                              const contact = getRelated(task.contact)
                              return contact && (
                                <Link
                                  href={`/dashboard/contacts/${contact.id}`}
                                  className="text-yellow-400 hover:underline"
                                >
                                  Contact: {contact.first_name} {contact.last_name}
                                </Link>
                              )
                            })()}
                            {(() => {
                              const deal = getRelated(task.deal)
                              return deal && (
                                <Link
                                  href={`/dashboard/deals/${deal.id}`}
                                  className="text-yellow-400 hover:underline"
                                >
                                  Deal: {deal.name}
                                </Link>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && modalDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">
                Add Event - {format(modalDate, 'MMMM d, yyyy')}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Event Type Selection */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Event Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setNewEvent({ ...newEvent, type: 'task' })}
                  className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${
                    newEvent.type === 'task'
                      ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400'
                      : 'glass-card-subtle text-gray-400 hover:text-white'
                  }`}
                >
                  <CheckSquare className="w-5 h-5" />
                  <span className="text-xs">Task</span>
                </button>
                <button
                  onClick={() => setNewEvent({ ...newEvent, type: 'call' })}
                  className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${
                    newEvent.type === 'call'
                      ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                      : 'glass-card-subtle text-gray-400 hover:text-white'
                  }`}
                >
                  <Phone className="w-5 h-5" />
                  <span className="text-xs">Call</span>
                </button>
                <button
                  onClick={() => setNewEvent({ ...newEvent, type: 'meeting' })}
                  className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${
                    newEvent.type === 'meeting'
                      ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                      : 'glass-card-subtle text-gray-400 hover:text-white'
                  }`}
                >
                  <Video className="w-5 h-5" />
                  <span className="text-xs">Meeting</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Title</label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Enter event title..."
                className="glass-input w-full px-4 py-2.5"
                autoFocus
              />
            </div>

            {/* Time */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Time</label>
              <input
                type="time"
                value={newEvent.time}
                onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                className="glass-input w-full px-4 py-2.5"
              />
            </div>

            {/* Priority */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Priority</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 1, label: 'Urgent', color: 'red' },
                  { value: 2, label: 'High', color: 'orange' },
                  { value: 3, label: 'Normal', color: 'yellow' },
                  { value: 4, label: 'Low', color: 'blue' },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setNewEvent({ ...newEvent, priority: p.value })}
                    className={`p-2 rounded-lg text-xs transition-all ${
                      newEvent.priority === p.value
                        ? `bg-${p.color}-500/20 border border-${p.color}-500/50 text-${p.color}-400`
                        : 'glass-card-subtle text-gray-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Description (optional)</label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                placeholder="Add details..."
                rows={3}
                className="glass-input w-full px-4 py-2.5 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2.5 glass-button rounded-xl text-gray-300 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddEvent}
                disabled={!newEvent.title.trim() || isSubmitting}
                className="flex-1 px-4 py-2.5 glass-button-gold rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Event
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
