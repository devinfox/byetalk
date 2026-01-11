'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Users,
  Copy,
  ExternalLink,
  MoreVertical,
  Trash2,
  Play,
  Link2,
  Zap,
  Check,
  X,
  Film,
  Download,
  RefreshCw,
  Loader2,
  FileText,
  MessageSquare,
  CheckSquare,
  ChevronRight,
  User,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Meeting } from '@/types/meeting.types'
import { ScheduleMeetingModal } from '@/components/meetings/schedule-meeting-modal'

interface MeetingsClientProps {
  currentUser: {
    id: string
    first_name: string
    last_name: string
    role: string
    timezone: string | null
  }
  upcomingMeetings: Meeting[]
  pastMeetings: Meeting[]
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
}

export function MeetingsClient({
  currentUser,
  upcomingMeetings: initialUpcoming,
  pastMeetings: initialPast,
  users,
  leads,
  contacts,
  deals,
}: MeetingsClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'recordings'>('upcoming')
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [upcomingMeetings, setUpcomingMeetings] = useState(initialUpcoming)
  const [pastMeetings, setPastMeetings] = useState(initialPast)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Instant meeting states
  const [creatingInstant, setCreatingInstant] = useState(false)
  const [instantMeetingData, setInstantMeetingData] = useState<{
    id: string
    title: string
    invite_code: string
    invite_url: string
  } | null>(null)

  // Recordings states
  const [recordings, setRecordings] = useState<any[]>([])
  const [loadingRecordings, setLoadingRecordings] = useState(false)
  const [syncingRecordings, setSyncingRecordings] = useState(false)
  const [playingRecording, setPlayingRecording] = useState<string | null>(null)

  // Transcript states
  const [transcribingRecording, setTranscribingRecording] = useState<string | null>(null)
  const [viewingTranscript, setViewingTranscript] = useState<any | null>(null)
  const [loadingTranscript, setLoadingTranscript] = useState(false)

  // Recording viewer states
  const [selectedRecording, setSelectedRecording] = useState<any | null>(null)
  const [recordingVideoUrl, setRecordingVideoUrl] = useState<string | null>(null)
  const [loadingRecordingDetails, setLoadingRecordingDetails] = useState(false)

  const meetings = activeTab === 'upcoming' ? upcomingMeetings : pastMeetings

  const copyInviteLink = async (inviteCode: string, meetingId: string) => {
    const baseUrl = window.location.origin
    const inviteUrl = `${baseUrl}/join/${inviteCode}`

    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopiedId(meetingId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Create instant meeting
  const createInstantMeeting = async () => {
    setCreatingInstant(true)
    try {
      const response = await fetch('/api/meetings/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        throw new Error('Failed to create instant meeting')
      }

      const data = await response.json()
      setInstantMeetingData(data.meeting)
    } catch (error) {
      console.error('Error creating instant meeting:', error)
      alert('Failed to create instant meeting. Please try again.')
    } finally {
      setCreatingInstant(false)
    }
  }

  // Copy instant meeting link
  const copyInstantLink = async () => {
    if (!instantMeetingData) return
    try {
      await navigator.clipboard.writeText(instantMeetingData.invite_url)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Join instant meeting
  const joinInstantMeeting = () => {
    if (!instantMeetingData) return
    router.push(`/dashboard/meetings/${instantMeetingData.id}`)
  }

  const handleJoin = (meetingId: string) => {
    router.push(`/dashboard/meetings/${meetingId}`)
  }

  const handleDelete = async (meetingId: string) => {
    if (!confirm('Are you sure you want to delete this meeting?')) return

    try {
      const response = await fetch(`/api/meetings/${meetingId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setUpcomingMeetings((prev) => prev.filter((m) => m.id !== meetingId))
        setPastMeetings((prev) => prev.filter((m) => m.id !== meetingId))
      }
    } catch (error) {
      console.error('Error deleting meeting:', error)
    }

    setOpenDropdown(null)
  }

  const handleMeetingCreated = () => {
    router.refresh()
    setShowScheduleModal(false)
  }

  // Fetch recordings
  const fetchRecordings = async () => {
    setLoadingRecordings(true)
    try {
      const response = await fetch('/api/meetings/recordings')
      if (response.ok) {
        const data = await response.json()
        setRecordings(data.recordings || [])
      }
    } catch (error) {
      console.error('Error fetching recordings:', error)
    } finally {
      setLoadingRecordings(false)
    }
  }

  // Sync recordings from Daily.co
  const syncRecordings = async () => {
    setSyncingRecordings(true)
    try {
      const response = await fetch('/api/meetings/recordings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (response.ok) {
        // Refresh recordings list after sync
        await fetchRecordings()
      }
    } catch (error) {
      console.error('Error syncing recordings:', error)
    } finally {
      setSyncingRecordings(false)
    }
  }

  // Open recording viewer with video and transcript
  const openRecordingViewer = async (recording: any) => {
    setSelectedRecording(recording)
    setLoadingRecordingDetails(true)
    setRecordingVideoUrl(null)
    setViewingTranscript(null)

    try {
      // Fetch fresh playback URL
      const response = await fetch(`/api/meetings/recordings/${recording.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data.recording?.playback_url) {
          setRecordingVideoUrl(data.recording.playback_url)
        }
      }

      // Also fetch transcript if available
      const transcriptResponse = await fetch(`/api/meetings/recordings/${recording.id}/transcribe`)
      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json()
        setViewingTranscript(transcriptData.transcript)
      }
    } catch (error) {
      console.error('Error loading recording details:', error)
    } finally {
      setLoadingRecordingDetails(false)
    }
  }

  // Close recording viewer
  const closeRecordingViewer = () => {
    setSelectedRecording(null)
    setRecordingVideoUrl(null)
    setViewingTranscript(null)
  }

  // Get playback URL for a recording (legacy - opens in new tab)
  const playRecording = async (recordingId: string) => {
    setPlayingRecording(recordingId)
    try {
      const response = await fetch(`/api/meetings/recordings/${recordingId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.recording?.playback_url) {
          window.open(data.recording.playback_url, '_blank')
        }
      }
    } catch (error) {
      console.error('Error getting playback URL:', error)
    } finally {
      setPlayingRecording(null)
    }
  }

  // Delete a recording
  const deleteRecording = async (recordingId: string) => {
    if (!confirm('Are you sure you want to delete this recording? This cannot be undone.')) {
      return
    }
    try {
      const response = await fetch(`/api/meetings/recordings/${recordingId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setRecordings((prev) => prev.filter((r) => r.id !== recordingId))
      }
    } catch (error) {
      console.error('Error deleting recording:', error)
    }
  }

  // Transcribe a recording
  const transcribeRecording = async (recordingId: string) => {
    setTranscribingRecording(recordingId)
    try {
      const response = await fetch(`/api/meetings/recordings/${recordingId}/transcribe`, {
        method: 'POST',
      })
      if (response.ok) {
        const data = await response.json()
        // Refresh recordings to show updated status
        await fetchRecordings()
        // Show the transcript
        await viewTranscript(recordingId)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to transcribe recording')
      }
    } catch (error) {
      console.error('Error transcribing recording:', error)
      alert('Failed to transcribe recording')
    } finally {
      setTranscribingRecording(null)
    }
  }

  // View transcript for a recording
  const viewTranscript = async (recordingId: string) => {
    setLoadingTranscript(true)
    try {
      const response = await fetch(`/api/meetings/recordings/${recordingId}/transcribe`)
      if (response.ok) {
        const data = await response.json()
        setViewingTranscript(data.transcript)
      } else if (response.status === 404) {
        // No transcript yet - offer to create one
        if (confirm('No transcript found. Would you like to transcribe this recording now?')) {
          await transcribeRecording(recordingId)
        }
      }
    } catch (error) {
      console.error('Error loading transcript:', error)
    } finally {
      setLoadingTranscript(false)
    }
  }

  // Format time for transcript
  const formatTranscriptTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
  }

  // Load recordings when tab changes to recordings
  const handleTabChange = (tab: 'upcoming' | 'past' | 'recordings') => {
    setActiveTab(tab)
    if (tab === 'recordings' && recordings.length === 0) {
      fetchRecordings()
    }
  }

  const formatMeetingTime = (scheduledAt: string, durationMinutes: number) => {
    const date = parseISO(scheduledAt)
    const endTime = new Date(date.getTime() + durationMinutes * 60 * 1000)

    return `${format(date, 'h:mm a')} - ${format(endTime, 'h:mm a')}`
  }

  const getMeetingStatus = (meeting: Meeting) => {
    if (meeting.status === 'in_progress') {
      return { label: 'Live', color: 'bg-red-500 animate-pulse' }
    }
    if (meeting.status === 'completed') {
      return { label: 'Ended', color: 'bg-gray-500' }
    }
    if (meeting.status === 'cancelled') {
      return { label: 'Cancelled', color: 'bg-gray-600' }
    }

    const scheduledAt = parseISO(meeting.scheduled_at)
    const now = new Date()
    const diffMinutes = (scheduledAt.getTime() - now.getTime()) / (1000 * 60)

    if (diffMinutes <= 5 && diffMinutes > -30) {
      return { label: 'Starting soon', color: 'bg-yellow-500' }
    }

    return { label: 'Scheduled', color: 'bg-blue-500' }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide flex items-center gap-3">
            <Video className="w-7 h-7 text-yellow-400" />
            Meetings
          </h1>
          <p className="text-gray-400 mt-1">Schedule and manage video conferences</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={createInstantMeeting}
            disabled={creatingInstant}
            className="flex items-center gap-2 px-5 py-2.5 glass-button rounded-xl text-sm font-medium transition-all hover:scale-105 disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-yellow-400" />
            {creatingInstant ? 'Creating...' : 'Instant Meeting'}
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 glass-button-gold rounded-xl text-sm font-medium transition-all hover:scale-105"
          >
            <Plus className="w-4 h-4" />
            Schedule Meeting
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => handleTabChange('upcoming')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'upcoming'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          Upcoming ({upcomingMeetings.length})
        </button>
        <button
          onClick={() => handleTabChange('past')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'past'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          Past ({pastMeetings.length})
        </button>
        <button
          onClick={() => handleTabChange('recordings')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'recordings'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          }`}
        >
          <Film className="w-4 h-4" />
          Recordings
        </button>
      </div>

      {/* Recordings Tab Content */}
      {activeTab === 'recordings' ? (
        <div className="space-y-4">
          {/* Recordings Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm">
              {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={syncRecordings}
              disabled={syncingRecordings}
              className="flex items-center gap-2 px-4 py-2 glass-button rounded-lg text-sm"
            >
              {syncingRecordings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {syncingRecordings ? 'Syncing...' : 'Sync from Daily.co'}
            </button>
          </div>

          {/* Recordings List */}
          {loadingRecordings ? (
            <div className="glass-card p-12 text-center">
              <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
              <p className="text-gray-400">Loading recordings...</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">No recordings yet</h3>
              <p className="text-gray-500 mb-6">
                Recordings from your meetings will appear here
              </p>
              <button
                onClick={syncRecordings}
                disabled={syncingRecordings}
                className="px-6 py-2.5 glass-button-gold rounded-xl text-sm font-medium"
              >
                Sync Recordings from Daily.co
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  onClick={() => openRecordingViewer(recording)}
                  className="glass-card overflow-hidden hover:border-yellow-500/30 transition-all cursor-pointer group"
                >
                  {/* Video Preview Thumbnail */}
                  <div className="relative aspect-video bg-gray-800">
                    {recording.thumbnail_url ? (
                      <img
                        src={recording.thumbnail_url}
                        alt="Recording thumbnail"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                        <Film className="w-16 h-16 text-gray-600" />
                      </div>
                    )}

                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-yellow-500/90 flex items-center justify-center">
                        <Play className="w-8 h-8 text-black ml-1" />
                      </div>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-xs font-medium">
                      {recording.duration_seconds
                        ? `${Math.floor(recording.duration_seconds / 60)}:${String(recording.duration_seconds % 60).padStart(2, '0')}`
                        : '--:--'}
                    </div>

                    {/* Transcription status badge */}
                    {recording.transcription_status && (
                      <div className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium ${
                        recording.transcription_status === 'completed'
                          ? 'bg-green-500/80 text-white'
                          : recording.transcription_status === 'processing'
                          ? 'bg-yellow-500/80 text-black'
                          : 'bg-gray-500/80 text-white'
                      }`}>
                        {recording.transcription_status === 'completed' ? 'Transcribed' :
                         recording.transcription_status === 'processing' ? 'Processing...' :
                         recording.transcription_status}
                      </div>
                    )}
                  </div>

                  {/* Recording Info */}
                  <div className="p-4">
                    <h3 className="text-base font-semibold text-white truncate mb-1">
                      {recording.meeting?.title || recording.room_name || 'Meeting Recording'}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {recording.started_at
                          ? format(parseISO(recording.started_at), 'MMM d, yyyy')
                          : format(parseISO(recording.created_at), 'MMM d, yyyy')}
                      </span>
                      {recording.meeting?.host && (
                        <span className="flex items-center gap-1 truncate">
                          <User className="w-3.5 h-3.5" />
                          {recording.meeting.host.first_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Meeting Cards */}
          {meetings.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Video className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">
                {activeTab === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'}
              </h3>
              <p className="text-gray-500 mb-6">
                {activeTab === 'upcoming'
                  ? 'Schedule a meeting to connect with your team or clients'
                  : 'Your completed meetings will appear here'}
              </p>
              {activeTab === 'upcoming' && (
                <button
                  onClick={() => setShowScheduleModal(true)}
                  className="px-6 py-2.5 glass-button-gold rounded-xl text-sm font-medium"
                >
                  Schedule Your First Meeting
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {meetings.map((meeting) => {
            const status = getMeetingStatus(meeting)
            const isHost = meeting.host_id === currentUser.id
            const participantCount = meeting.participants?.length || 0

            return (
              <div
                key={meeting.id}
                className="glass-card p-5 hover:border-yellow-500/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{meeting.title}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium text-white ${status.color}`}
                      >
                        {status.label}
                      </span>
                      {isHost && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                          Host
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {format(parseISO(meeting.scheduled_at), 'EEE, MMM d, yyyy')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {formatMeetingTime(meeting.scheduled_at, meeting.duration_minutes)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        {participantCount} participant{participantCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {meeting.description && (
                      <p className="text-gray-500 text-sm mt-2 line-clamp-2">{meeting.description}</p>
                    )}

                    {/* Entity links */}
                    {(meeting.lead || meeting.contact || meeting.deal) && (
                      <div className="flex items-center gap-3 mt-3">
                        {meeting.lead && (
                          <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                            Lead: {meeting.lead.first_name} {meeting.lead.last_name}
                          </span>
                        )}
                        {meeting.contact && (
                          <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400">
                            Contact: {meeting.contact.first_name} {meeting.contact.last_name}
                          </span>
                        )}
                        {meeting.deal && (
                          <span className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-400">
                            Deal: {meeting.deal.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {activeTab === 'upcoming' && meeting.status !== 'cancelled' && (
                      <>
                        <button
                          onClick={() => copyInviteLink(meeting.invite_code, meeting.id)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Copy invite link"
                        >
                          {copiedId === meeting.id ? (
                            <span className="text-xs text-green-400">Copied!</span>
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleJoin(meeting.id)}
                          className="flex items-center gap-2 px-4 py-2 glass-button-gold rounded-lg text-sm font-medium"
                        >
                          <Play className="w-4 h-4" />
                          {meeting.status === 'in_progress' ? 'Join' : 'Start'}
                        </button>
                      </>
                    )}

                    {activeTab === 'past' && meeting.recordings && meeting.recordings.length > 0 && (
                      <button
                        onClick={() => router.push(`/dashboard/meetings/${meeting.id}`)}
                        className="flex items-center gap-2 px-4 py-2 glass-button rounded-lg text-sm font-medium"
                      >
                        <Video className="w-4 h-4" />
                        View Recording
                      </button>
                    )}

                    {/* Dropdown menu */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === meeting.id ? null : meeting.id)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openDropdown === meeting.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenDropdown(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-48 glass-card py-1 z-20">
                            <button
                              onClick={() => copyInviteLink(meeting.invite_code, meeting.id)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"
                            >
                              <Copy className="w-4 h-4" />
                              Copy Invite Link
                            </button>
                            <button
                              onClick={() => {
                                window.open(`/join/${meeting.invite_code}`, '_blank')
                                setOpenDropdown(null)
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Open Invite Page
                            </button>
                            {isHost && (
                              <>
                                <div className="border-t border-white/10 my-1" />
                                <button
                                  onClick={() => handleDelete(meeting.id)}
                                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Meeting
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          </div>
        )}
        </>
      )}

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <ScheduleMeetingModal
          currentUser={currentUser}
          users={users}
          leads={leads}
          contacts={contacts}
          deals={deals}
          onClose={() => setShowScheduleModal(false)}
          onCreated={handleMeetingCreated}
        />
      )}

      {/* Instant Meeting Created Modal */}
      {instantMeetingData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Meeting Ready</h2>
                  <p className="text-sm text-gray-400">Share the link to invite others</p>
                </div>
              </div>
              <button
                onClick={() => setInstantMeetingData(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Share this link with anyone to join
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={instantMeetingData.invite_url}
                    className="flex-1 glass-input px-3 py-2 text-sm"
                  />
                  <button
                    onClick={copyInstantLink}
                    className="px-4 py-2 glass-button rounded-lg flex items-center gap-2 text-sm"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => setInstantMeetingData(null)}
                  className="flex-1 px-4 py-2.5 glass-button rounded-xl text-sm font-medium"
                >
                  Close
                </button>
                <button
                  onClick={joinInstantMeeting}
                  className="flex-1 px-4 py-2.5 glass-button-gold rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  Join Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Viewer Modal */}
      {viewingTranscript && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                  <FileText className="w-6 h-6 text-yellow-400" />
                  Meeting Transcript
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {viewingTranscript.speaker_count} speakers • {Math.floor((viewingTranscript.duration_seconds || 0) / 60)} min
                </p>
              </div>
              <button
                onClick={() => setViewingTranscript(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex">
              {/* Transcript Panel */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {viewingTranscript.utterances?.map((utterance: any, index: number) => (
                    <div key={index} className="flex gap-4">
                      <div className="w-20 shrink-0">
                        <span className="text-xs text-gray-500">
                          {formatTranscriptTime(utterance.start_time_ms)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                            {utterance.speaker_label}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">
                          {utterance.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Insights Panel */}
              {viewingTranscript.insights?.[0] && (
                <div className="w-80 border-l border-white/10 bg-gray-900/50 overflow-y-auto p-6">
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
                    AI Insights
                  </h3>

                  {/* Summary */}
                  <div className="mb-6">
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Summary</h4>
                    <p className="text-sm text-gray-300">
                      {viewingTranscript.insights[0].summary}
                    </p>
                  </div>

                  {/* Sentiment */}
                  <div className="mb-6">
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Sentiment</h4>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        viewingTranscript.insights[0].sentiment === 'positive'
                          ? 'bg-green-500/20 text-green-400'
                          : viewingTranscript.insights[0].sentiment === 'negative'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {viewingTranscript.insights[0].sentiment}
                      </span>
                    </div>
                  </div>

                  {/* Key Topics */}
                  {viewingTranscript.insights[0].key_topics?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Key Topics</h4>
                      <div className="flex flex-wrap gap-2">
                        {viewingTranscript.insights[0].key_topics.map((topic: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-white/5 rounded text-xs text-gray-300">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Items */}
                  {viewingTranscript.insights[0].action_items?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                        <CheckSquare className="w-4 h-4" />
                        Action Items ({viewingTranscript.insights[0].action_items.length})
                      </h4>
                      <div className="space-y-3">
                        {viewingTranscript.insights[0].action_items.map((item: any, i: number) => (
                          <div key={i} className="p-3 bg-white/5 rounded-lg">
                            <p className="text-sm text-gray-300 mb-2">{item.text}</p>
                            <div className="flex items-center gap-2 text-xs">
                              {item.assignee_name && (
                                <span className="flex items-center gap-1 text-blue-400">
                                  <User className="w-3 h-3" />
                                  {item.assignee_name}
                                </span>
                              )}
                              {item.due_date && (
                                <span className="text-gray-500">
                                  Due: {item.due_date}
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                item.priority === 'high'
                                  ? 'bg-red-500/20 text-red-400'
                                  : item.priority === 'medium'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {item.priority}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Decisions */}
                  {viewingTranscript.insights[0].decisions?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Decisions Made</h4>
                      <div className="space-y-2">
                        {viewingTranscript.insights[0].decisions.map((decision: any, i: number) => (
                          <div key={i} className="p-2 bg-green-500/10 border border-green-500/20 rounded text-sm text-gray-300">
                            {decision.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Commitments */}
                  {viewingTranscript.insights[0].commitments?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Commitments</h4>
                      <div className="space-y-2">
                        {viewingTranscript.insights[0].commitments.map((commitment: any, i: number) => (
                          <div key={i} className="p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                            <p className="text-sm text-gray-300">{commitment.text}</p>
                            <p className="text-xs text-blue-400 mt-1">— {commitment.speaker}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setViewingTranscript(null)}
                className="px-4 py-2 glass-button rounded-lg text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Recording Viewer Modal */}
      {selectedRecording && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-7xl max-h-[95vh] flex flex-col bg-gray-900 rounded-2xl overflow-hidden border border-white/10">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/30">
              <div className="flex items-center gap-4">
                <Film className="w-6 h-6 text-yellow-400" />
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {selectedRecording.meeting?.title || selectedRecording.room_name || 'Meeting Recording'}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-gray-400 mt-0.5">
                    <span>
                      {selectedRecording.started_at
                        ? format(parseISO(selectedRecording.started_at), 'MMM d, yyyy • h:mm a')
                        : format(parseISO(selectedRecording.created_at), 'MMM d, yyyy')}
                    </span>
                    <span>
                      {selectedRecording.duration_seconds
                        ? `${Math.floor(selectedRecording.duration_seconds / 60)}:${String(selectedRecording.duration_seconds % 60).padStart(2, '0')}`
                        : 'Unknown duration'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedRecording.download_url && (
                  <a
                    href={selectedRecording.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 glass-button rounded-lg flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                )}
                <button
                  onClick={closeRecordingViewer}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* Video Player */}
              <div className="flex-1 flex flex-col bg-black">
                {loadingRecordingDetails ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-yellow-400 animate-spin" />
                  </div>
                ) : recordingVideoUrl ? (
                  <video
                    src={recordingVideoUrl}
                    controls
                    autoPlay
                    className="flex-1 w-full h-full"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">Video not available</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Transcript & Insights Sidebar */}
              <div className="w-96 border-l border-white/10 flex flex-col bg-gray-900/80">
                {/* Sidebar Tabs */}
                <div className="flex border-b border-white/10">
                  <button className="flex-1 px-4 py-3 text-sm font-medium text-yellow-400 border-b-2 border-yellow-400 bg-yellow-500/5">
                    Transcript
                  </button>
                </div>

                {/* Transcript Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingRecordingDetails ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  ) : viewingTranscript?.utterances?.length > 0 ? (
                    <div className="space-y-4">
                      {viewingTranscript.utterances.map((utterance: any, index: number) => (
                        <div key={index} className="group">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                              {utterance.speaker_label}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatTranscriptTime(utterance.start_time_ms)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed">
                            {utterance.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : viewingTranscript?.full_text ? (
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {viewingTranscript.full_text}
                    </p>
                  ) : (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-400 text-sm mb-3">No transcript available</p>
                      <button
                        onClick={() => viewTranscript(selectedRecording.id)}
                        disabled={transcribingRecording === selectedRecording.id}
                        className="px-4 py-2 glass-button-gold rounded-lg text-sm font-medium inline-flex items-center gap-2"
                      >
                        {transcribingRecording === selectedRecording.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Transcribing...
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            Generate Transcript
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Insights Panel */}
                {viewingTranscript?.insights?.[0] && (
                  <div className="border-t border-white/10 p-4 bg-black/20 max-h-64 overflow-y-auto">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wide mb-3">
                      AI Insights
                    </h3>

                    <div className="space-y-3">
                      {/* Summary */}
                      <div>
                        <p className="text-xs text-gray-300 line-clamp-3">
                          {viewingTranscript.insights[0].summary}
                        </p>
                      </div>

                      {/* Action Items Count */}
                      {viewingTranscript.insights[0].action_items?.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <CheckSquare className="w-4 h-4 text-yellow-400" />
                          <span className="text-gray-300">
                            {viewingTranscript.insights[0].action_items.length} action item(s) extracted
                          </span>
                        </div>
                      )}

                      {/* Key Topics */}
                      {viewingTranscript.insights[0].key_topics?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {viewingTranscript.insights[0].key_topics.slice(0, 4).map((topic: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-xs text-gray-400">
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
