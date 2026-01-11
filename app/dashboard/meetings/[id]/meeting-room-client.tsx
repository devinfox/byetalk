'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DailyIframe from '@daily-co/daily-js'
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  Monitor,
  Phone,
  MessageSquare,
  Users,
  Circle,
  StopCircle,
  ArrowLeft,
  Copy,
  Settings,
  Hand,
  Check,
  X,
  AlertCircle,
} from 'lucide-react'
import type { Meeting } from '@/types/meeting.types'

interface MeetingRoomClientProps {
  meeting: Meeting
  currentUser: {
    id: string
    first_name: string
    last_name: string
    email: string
    avatar_url: string | null
  }
  isHost: boolean
}

interface ScreenShareRequest {
  participantId: string
  participantName: string
  timestamp: Date
}

export function MeetingRoomClient({ meeting, currentUser, isHost }: MeetingRoomClientProps) {
  const router = useRouter()
  const [callFrame, setCallFrame] = useState<ReturnType<typeof DailyIframe.createFrame> | null>(null)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-join device settings
  const [showPreJoin, setShowPreJoin] = useState(true)
  const [preJoinMuted, setPreJoinMuted] = useState(false)
  const [preJoinVideoOff, setPreJoinVideoOff] = useState(false)

  // Media states
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [copied, setCopied] = useState(false)

  // Screen share request handling
  const [screenShareRequests, setScreenShareRequests] = useState<ScreenShareRequest[]>([])
  const [pendingScreenShare, setPendingScreenShare] = useState(false)
  const [screenShareDenied, setScreenShareDenied] = useState(false)

  // Get meeting config
  const meetingConfig = (meeting.daily_room_config as any) || {}
  const autoRecord = meetingConfig.auto_record !== false
  const screenshareRequiresApproval = meetingConfig.screenshare_requires_approval !== false

  // Join meeting
  const joinMeeting = useCallback(async () => {
    if (joining || joined) return
    setJoining(true)
    setError(null)
    setShowPreJoin(false)

    try {
      // Get meeting token from API
      const response = await fetch(`/api/meetings/${meeting.id}/join`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to join meeting')
      }

      const { token, roomUrl } = await response.json()

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

      // Set up event listeners
      frame.on('joined-meeting', async () => {
        setJoined(true)
        setJoining(false)

        // Apply pre-join settings
        if (preJoinMuted) {
          frame.setLocalAudio(false)
          setIsMuted(true)
        }
        if (preJoinVideoOff) {
          frame.setLocalVideo(false)
          setIsVideoOff(true)
        }

        // Auto-start recording if host and auto_record is enabled
        if (isHost && autoRecord) {
          try {
            await frame.startRecording()
            setIsRecording(true)
          } catch (err) {
            console.error('Failed to auto-start recording:', err)
          }
        }
      })

      frame.on('left-meeting', () => {
        setJoined(false)
        router.push('/dashboard/meetings')
      })

      frame.on('participant-joined', () => {
        updateParticipantCount(frame)
      })

      frame.on('participant-left', () => {
        updateParticipantCount(frame)
      })

      frame.on('error', (e) => {
        console.error('Daily.co error:', e)
        setError('Video call error occurred')
      })

      frame.on('recording-started', () => {
        setIsRecording(true)
      })

      frame.on('recording-stopped', () => {
        setIsRecording(false)
      })

      // Join the room
      await frame.join({
        url: roomUrl,
        token: token,
        userName: `${currentUser.first_name} ${currentUser.last_name}`,
      })

      setCallFrame(frame)
    } catch (err) {
      console.error('Error joining meeting:', err)
      setError(err instanceof Error ? err.message : 'Failed to join meeting')
      setJoining(false)
      setShowPreJoin(true)
    }
  }, [meeting.id, currentUser, joining, joined, router, isHost, autoRecord, preJoinMuted, preJoinVideoOff])

  const updateParticipantCount = (frame: ReturnType<typeof DailyIframe.createFrame>) => {
    const participants = frame.participants()
    setParticipantCount(Object.keys(participants).length)
  }

  // Leave meeting
  const leaveMeeting = useCallback(async () => {
    if (callFrame) {
      await callFrame.leave()
      callFrame.destroy()
    }
    router.push('/dashboard/meetings')
  }, [callFrame, router])

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

  // Request screen share (for non-hosts when approval required)
  const requestScreenShare = useCallback(async () => {
    if (!callFrame) return

    if (isHost || !screenshareRequiresApproval) {
      // Host can always share, or approval not required
      if (isScreenSharing) {
        await callFrame.stopScreenShare()
      } else {
        await callFrame.startScreenShare()
      }
      setIsScreenSharing(!isScreenSharing)
    } else {
      // Non-host needs to request permission
      setPendingScreenShare(true)
      setScreenShareDenied(false)
      // In a real implementation, this would send a message to the host
      // For now, we'll simulate with a broadcast message
      callFrame.sendAppMessage({
        type: 'screen_share_request',
        from: currentUser.id,
        fromName: `${currentUser.first_name} ${currentUser.last_name}`,
      }, '*')
    }
  }, [callFrame, isScreenSharing, isHost, screenshareRequiresApproval, currentUser])

  // Handle screen share approval (host only)
  const handleScreenShareApproval = useCallback(async (request: ScreenShareRequest, approved: boolean) => {
    if (!callFrame) return

    // Remove from pending requests
    setScreenShareRequests(prev => prev.filter(r => r.participantId !== request.participantId))

    // Send response
    callFrame.sendAppMessage({
      type: 'screen_share_response',
      to: request.participantId,
      approved,
    }, '*')
  }, [callFrame])

  // Listen for screen share requests and responses
  useEffect(() => {
    if (!callFrame) return

    const handleAppMessage = (event: any) => {
      const { data, fromId } = event

      if (data.type === 'screen_share_request' && isHost) {
        // Host receives a screen share request
        setScreenShareRequests(prev => [
          ...prev,
          {
            participantId: fromId,
            participantName: data.fromName,
            timestamp: new Date(),
          },
        ])
      } else if (data.type === 'screen_share_response' && data.to === currentUser.id) {
        // Requester receives response
        setPendingScreenShare(false)
        if (data.approved) {
          callFrame.startScreenShare()
          setIsScreenSharing(true)
        } else {
          setScreenShareDenied(true)
          setTimeout(() => setScreenShareDenied(false), 3000)
        }
      }
    }

    callFrame.on('app-message', handleAppMessage)

    return () => {
      callFrame.off('app-message', handleAppMessage)
    }
  }, [callFrame, isHost, currentUser.id])

  // Toggle recording (host only)
  const toggleRecording = useCallback(async () => {
    if (callFrame && isHost) {
      if (isRecording) {
        await callFrame.stopRecording()
      } else {
        await callFrame.startRecording()
      }
    }
  }, [callFrame, isHost, isRecording])

  // Copy invite link
  const copyInviteLink = async () => {
    const inviteUrl = `${window.location.origin}/join/${meeting.invite_code}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callFrame) {
        callFrame.leave()
        callFrame.destroy()
      }
    }
  }, [callFrame])

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-14 border-b border-white/10 bg-gray-900/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/meetings')}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-white font-semibold">{meeting.title}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {meeting.status === 'in_progress' && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Live
                </span>
              )}
              <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
              {isRecording && (
                <span className="flex items-center gap-1 text-red-400">
                  <Circle className="w-3 h-3 fill-current" />
                  Recording
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : <><Copy className="w-4 h-4" /> Invite</>}
          </button>
        </div>
      </div>

      {/* Screen Share Requests (Host Only) */}
      {isHost && screenShareRequests.length > 0 && (
        <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
          {screenShareRequests.map((request) => (
            <div key={request.participantId} className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-yellow-300">
                <Hand className="w-4 h-4" />
                <span><strong>{request.participantName}</strong> wants to share their screen</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleScreenShareApproval(request, true)}
                  className="p-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleScreenShareApproval(request, false)}
                  className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Area */}
        <div className="flex-1 relative">
          {/* Daily.co video container - always rendered but hidden when not joined */}
          <div
            id="daily-container"
            className={`absolute inset-0 ${joined ? '' : 'invisible'}`}
          />

          {/* Pre-join lobby overlay */}
          {showPreJoin && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
              <div className="glass-card p-8 text-center max-w-lg w-full mx-4">
                <Video className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">{meeting.title}</h2>
                <p className="text-gray-400 mb-6">
                  {isHost ? "You're the host. Configure your settings before starting." : 'Configure your settings before joining.'}
                </p>

                {/* Device Settings */}
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between p-4 glass-card rounded-xl">
                    <div className="flex items-center gap-3">
                      {preJoinMuted ? (
                        <MicOff className="w-5 h-5 text-red-400" />
                      ) : (
                        <Mic className="w-5 h-5 text-green-400" />
                      )}
                      <span className="text-gray-300">Microphone</span>
                    </div>
                    <button
                      onClick={() => setPreJoinMuted(!preJoinMuted)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        preJoinMuted
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {preJoinMuted ? 'Muted' : 'On'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 glass-card rounded-xl">
                    <div className="flex items-center gap-3">
                      {preJoinVideoOff ? (
                        <VideoOff className="w-5 h-5 text-red-400" />
                      ) : (
                        <Video className="w-5 h-5 text-green-400" />
                      )}
                      <span className="text-gray-300">Camera</span>
                    </div>
                    <button
                      onClick={() => setPreJoinVideoOff(!preJoinVideoOff)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        preJoinVideoOff
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}
                    >
                      {preJoinVideoOff ? 'Off' : 'On'}
                    </button>
                  </div>
                </div>

                {/* Auto-recording notice */}
                {autoRecord && (
                  <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-6 text-sm text-blue-300">
                    <Circle className="w-4 h-4 fill-red-500 text-red-500" />
                    <span>This meeting will be automatically recorded</span>
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-sm mb-4">
                    {error}
                  </div>
                )}

                <button
                  onClick={joinMeeting}
                  disabled={joining}
                  className="w-full px-6 py-3 glass-button-gold rounded-xl font-medium disabled:opacity-50"
                >
                  {joining ? 'Connecting...' : isHost ? 'Start Meeting' : 'Join Meeting'}
                </button>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <p className="text-sm text-gray-500 mb-2">Share invite link</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/join/${meeting.invite_code}`}
                      className="flex-1 glass-input px-3 py-2 text-sm"
                    />
                    <button
                      onClick={copyInviteLink}
                      className="px-3 py-2 glass-button rounded-lg"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Connecting state overlay */}
          {!showPreJoin && !joined && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Connecting to meeting...</p>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        {(showChat || showParticipants) && joined && (
          <div className="w-80 border-l border-white/10 bg-gray-900/50 flex flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-medium text-white">
                {showChat ? 'Chat' : 'Participants'}
              </h3>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              {showParticipants && (
                <div className="space-y-2">
                  {meeting.participants?.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm text-white">
                        {p.name?.[0] || p.email?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {p.name || p.email}
                        </p>
                        <p className="text-xs text-gray-500">{p.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {showChat && (
                <p className="text-gray-500 text-sm">Chat is handled by Daily.co</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {joined && (
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

          {/* Screen Share Button */}
          <button
            onClick={requestScreenShare}
            disabled={pendingScreenShare}
            className={`p-4 rounded-full transition-colors relative ${
              isScreenSharing
                ? 'bg-green-500 text-white'
                : pendingScreenShare
                ? 'bg-yellow-500/50 text-yellow-200'
                : screenShareDenied
                ? 'bg-red-500/50 text-red-200'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title={
              pendingScreenShare
                ? 'Waiting for approval...'
                : screenShareDenied
                ? 'Request denied'
                : isScreenSharing
                ? 'Stop sharing'
                : screenshareRequiresApproval && !isHost
                ? 'Request to share screen'
                : 'Share screen'
            }
          >
            <Monitor className="w-5 h-5" />
            {pendingScreenShare && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
            )}
            {screenShareDenied && (
              <span className="absolute -top-1 -right-1">
                <AlertCircle className="w-4 h-4 text-red-400" />
              </span>
            )}
          </button>

          {/* Recording Button (Host Only) */}
          {isHost && (
            <button
              onClick={toggleRecording}
              className={`p-4 rounded-full transition-colors ${
                isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <StopCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
            </button>
          )}

          <div className="w-px h-8 bg-white/10 mx-2" />

          <button
            onClick={() => {
              setShowChat(!showChat)
              setShowParticipants(false)
            }}
            className={`p-4 rounded-full transition-colors ${
              showChat
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title="Chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              setShowParticipants(!showParticipants)
              setShowChat(false)
            }}
            className={`p-4 rounded-full transition-colors ${
              showParticipants
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title="Participants"
          >
            <Users className="w-5 h-5" />
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
      )}
    </div>
  )
}
