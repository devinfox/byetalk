'use client'

import { useState, useEffect, useCallback } from 'react'
import DailyIframe from '@daily-co/daily-js'
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  Monitor,
  Phone,
  Users,
  Calendar,
  Clock,
  User,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface JoinClientProps {
  inviteCode: string
}

interface MeetingInfo {
  id: string
  title: string
  description: string | null
  scheduled_at: string
  duration_minutes: number
  status: string
  require_approval: boolean
  host_name: string
  participant_count: number
  max_participants: number
  meeting_type?: 'client' | 'internal' | 'instant'
}

export function JoinClient({ inviteCode }: JoinClientProps) {
  const [step, setStep] = useState<'loading' | 'info' | 'join' | 'waiting' | 'meeting'>('loading')
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [joining, setJoining] = useState(false)
  const [callFrame, setCallFrame] = useState<ReturnType<typeof DailyIframe.createFrame> | null>(null)

  // Media states
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)

  // Fetch meeting info on load
  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        const response = await fetch(`/api/meetings/join/${inviteCode}`)
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Meeting not found')
        }
        const data = await response.json()
        setMeeting(data.meeting)
        // For instant meetings, skip directly to the join form
        if (data.meeting.meeting_type === 'instant') {
          setStep('join')
        } else {
          setStep('info')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load meeting')
        setStep('info')
      }
    }

    fetchMeeting()
  }, [inviteCode])

  // Join meeting as guest
  const handleJoin = useCallback(async () => {
    if (!guestName.trim() || joining) return
    setJoining(true)
    setError(null)

    try {
      const response = await fetch(`/api/meetings/join/${inviteCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: guestName.trim(),
          email: guestEmail.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to join meeting')
      }

      const data = await response.json()

      // Check if waiting for approval
      if (data.status === 'waiting_approval') {
        setStep('waiting')
        setJoining(false)
        return
      }

      // Create Daily.co iframe
      const container = document.getElementById('daily-container')
      if (!container) {
        throw new Error('Video container not found')
      }

      const frame = DailyIframe.createFrame(container, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '12px',
        },
        showLeaveButton: false,
        showFullscreenButton: true,
      })

      frame.on('joined-meeting', () => {
        setStep('meeting')
        setJoining(false)
      })

      frame.on('left-meeting', () => {
        setStep('info')
        setGuestName('')
        setGuestEmail('')
      })

      frame.on('error', (e) => {
        console.error('Daily.co error:', e)
        setError('Video call error occurred')
      })

      await frame.join({
        url: data.roomUrl,
        token: data.token,
        userName: guestName.trim(),
      })

      setCallFrame(frame)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join meeting')
      setJoining(false)
    }
  }, [inviteCode, guestName, guestEmail, joining])

  // Leave meeting
  const leaveMeeting = useCallback(async () => {
    if (callFrame) {
      await callFrame.leave()
      callFrame.destroy()
      setCallFrame(null)
    }
    setStep('info')
  }, [callFrame])

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (callFrame) {
      callFrame.setLocalAudio(!isMuted)
      setIsMuted(!isMuted)
    }
  }, [callFrame, isMuted])

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (callFrame) {
      callFrame.setLocalVideo(!isVideoOff)
      setIsVideoOff(!isVideoOff)
    }
  }, [callFrame, isVideoOff])

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (callFrame) {
      if (isScreenSharing) {
        await callFrame.stopScreenShare()
      } else {
        await callFrame.startScreenShare()
      }
      setIsScreenSharing(!isScreenSharing)
    }
  }, [callFrame, isScreenSharing])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callFrame) {
        callFrame.leave()
        callFrame.destroy()
      }
    }
  }, [callFrame])

  // Loading state
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading meeting...</p>
        </div>
      </div>
    )
  }

  // Error or meeting info
  if (step === 'info' || step === 'join') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full">
          {error ? (
            <div className="text-center">
              <Video className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">Unable to Join</h1>
              <p className="text-red-400 mb-6">{error}</p>
              <a
                href="/"
                className="px-6 py-2 glass-button rounded-xl text-sm font-medium inline-block"
              >
                Go Home
              </a>
            </div>
          ) : meeting ? (
            step === 'info' ? (
              <>
                <div className="text-center mb-6">
                  <Video className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                  <h1 className="text-xl font-semibold text-white mb-2">{meeting.title}</h1>
                  <p className="text-gray-400">Hosted by {meeting.host_name}</p>
                </div>

                {meeting.meeting_type !== 'instant' && (
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3 text-gray-300">
                      <Calendar className="w-5 h-5 text-gray-500" />
                      <span>{format(parseISO(meeting.scheduled_at), 'EEEE, MMMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-300">
                      <Clock className="w-5 h-5 text-gray-500" />
                      <span>
                        {format(parseISO(meeting.scheduled_at), 'h:mm a')} ({meeting.duration_minutes} min)
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-300">
                      <Users className="w-5 h-5 text-gray-500" />
                      <span>
                        {meeting.participant_count} / {meeting.max_participants} participants
                      </span>
                    </div>
                  </div>
                )}

                {meeting.meeting_type === 'instant' && (
                  <div className="flex items-center gap-3 text-gray-300 mb-6 justify-center">
                    <Users className="w-5 h-5 text-gray-500" />
                    <span>
                      {meeting.participant_count} / {meeting.max_participants} participants
                    </span>
                  </div>
                )}

                {meeting.description && (
                  <p className="text-gray-500 text-sm mb-6 p-3 bg-white/5 rounded-lg">
                    {meeting.description}
                  </p>
                )}

                {meeting.status === 'cancelled' ? (
                  <div className="text-center p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400">This meeting has been cancelled</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setStep('join')}
                    className="w-full px-6 py-3 glass-button-gold rounded-xl font-medium"
                  >
                    Continue to Join
                  </button>
                )}
              </>
            ) : (
              <>
                {meeting.meeting_type !== 'instant' && (
                  <button
                    onClick={() => setStep('info')}
                    className="text-gray-400 hover:text-white mb-4 text-sm"
                  >
                    &larr; Back
                  </button>
                )}

                <div className="text-center mb-6">
                  <User className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-white mb-2">
                    {meeting.meeting_type === 'instant' ? 'Join Meeting' : 'Enter Your Name'}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {meeting.meeting_type === 'instant'
                      ? `You're joining "${meeting.title}"`
                      : 'This is how you\'ll appear in the meeting'}
                  </p>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">
                      Your Name *
                    </label>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="glass-input w-full px-3 py-2"
                      placeholder="John Smith"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="glass-input w-full px-3 py-2"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm mb-4">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleJoin}
                  disabled={!guestName.trim() || joining}
                  className="w-full px-6 py-3 glass-button-gold rounded-xl font-medium disabled:opacity-50"
                >
                  {joining ? 'Joining...' : 'Join Meeting'}
                </button>
              </>
            )
          ) : null}
        </div>
      </div>
    )
  }

  // Waiting for approval
  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Waiting for Host</h2>
          <p className="text-gray-400 mb-6">
            The host will let you in shortly. Please wait...
          </p>
          <button
            onClick={() => setStep('info')}
            className="px-6 py-2 glass-button rounded-xl text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // In meeting
  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-14 border-b border-white/10 bg-gray-900/50 flex items-center justify-between px-4">
        <div>
          <h1 className="text-white font-semibold">{meeting?.title}</h1>
          <p className="text-xs text-gray-400">Joined as {guestName}</p>
        </div>
      </div>

      {/* Video Area */}
      <div className="flex-1 relative">
        <div id="daily-container" className="absolute inset-0" />
      </div>

      {/* Controls */}
      <div className="h-20 border-t border-white/10 bg-gray-900/50 flex items-center justify-center gap-4">
        <button
          onClick={toggleAudio}
          className={`p-4 rounded-full transition-colors ${
            isMuted
              ? 'bg-red-500 text-white'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full transition-colors ${
            isVideoOff
              ? 'bg-red-500 text-white'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-4 rounded-full transition-colors ${
            isScreenSharing
              ? 'bg-green-500 text-white'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <Monitor className="w-5 h-5" />
        </button>

        <div className="w-px h-8 bg-white/10 mx-2" />

        <button
          onClick={leaveMeeting}
          className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition-colors flex items-center gap-2"
        >
          <Phone className="w-5 h-5 rotate-[135deg]" />
          Leave
        </button>
      </div>
    </div>
  )
}
