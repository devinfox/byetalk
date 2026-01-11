import type { DailyRoom, DailyRoomConfig, DailyMeetingToken, DailyTokenConfig } from '@/types/meeting.types'

const DAILY_API_URL = 'https://api.daily.co/v1'

/**
 * Get the Daily.co API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) {
    throw new Error('DAILY_API_KEY environment variable is not set')
  }
  return apiKey
}

/**
 * Get the Daily.co domain from environment
 */
export function getDailyDomain(): string {
  return process.env.DAILY_DOMAIN || 'daily.co'
}

/**
 * Generate a unique room name
 */
export function generateRoomName(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `byetalk-${timestamp}-${random}`
}

/**
 * Make an authenticated request to Daily.co API
 */
async function dailyFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${DAILY_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      `Daily.co API error: ${response.status} - ${error.info || error.error || response.statusText}`
    )
  }

  return response.json()
}

// ============================================================================
// ROOM MANAGEMENT
// ============================================================================

/**
 * Create a new Daily.co room with all premium features enabled
 */
export async function createDailyRoom(config?: DailyRoomConfig): Promise<DailyRoom> {
  const roomName = config?.name || generateRoomName()

  // Set expiration to 24 hours from now (can be extended)
  const expirationTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60

  const roomConfig: DailyRoomConfig = {
    name: roomName,
    privacy: config?.privacy || 'private',
    properties: {
      max_participants: config?.properties?.max_participants || 10,
      enable_screenshare: config?.properties?.enable_screenshare ?? true,
      enable_chat: config?.properties?.enable_chat ?? true,
      enable_knocking: config?.properties?.enable_knocking ?? false,
      enable_recording: config?.properties?.enable_recording ?? 'cloud',
      enable_transcription: config?.properties?.enable_transcription ?? true, // Auto-transcribe recordings
      enable_advanced_chat: config?.properties?.enable_advanced_chat ?? true,
      enable_network_ui: config?.properties?.enable_network_ui ?? true,
      enable_noise_cancellation_ui: config?.properties?.enable_noise_cancellation_ui ?? true,
      enable_prejoin_ui: config?.properties?.enable_prejoin_ui ?? false,
      start_video_off: config?.properties?.start_video_off ?? false,
      start_audio_off: config?.properties?.start_audio_off ?? false,
      exp: config?.properties?.exp || expirationTime,
      eject_at_room_exp: config?.properties?.eject_at_room_exp ?? true,
    },
  }

  return dailyFetch<DailyRoom>('/rooms', {
    method: 'POST',
    body: JSON.stringify(roomConfig),
  })
}

/**
 * Get room details
 */
export async function getDailyRoom(roomName: string): Promise<DailyRoom | null> {
  try {
    return await dailyFetch<DailyRoom>(`/rooms/${roomName}`)
  } catch (error) {
    // Room not found
    return null
  }
}

/**
 * Update room configuration
 */
export async function updateDailyRoom(
  roomName: string,
  config: Partial<DailyRoomConfig>
): Promise<DailyRoom> {
  return dailyFetch<DailyRoom>(`/rooms/${roomName}`, {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

/**
 * Delete a Daily.co room
 */
export async function deleteDailyRoom(roomName: string): Promise<void> {
  await dailyFetch(`/rooms/${roomName}`, {
    method: 'DELETE',
  })
}

/**
 * Extend room expiration
 */
export async function extendRoomExpiration(
  roomName: string,
  hoursToAdd: number = 24
): Promise<DailyRoom> {
  const newExpiration = Math.floor(Date.now() / 1000) + hoursToAdd * 60 * 60

  return updateDailyRoom(roomName, {
    properties: {
      exp: newExpiration,
    },
  })
}

// ============================================================================
// MEETING TOKENS
// ============================================================================

/**
 * Create a meeting token for a participant
 */
export async function createMeetingToken(config: DailyTokenConfig): Promise<DailyMeetingToken> {
  // Set token expiration to 24 hours
  const tokenExpiration = Math.floor(Date.now() / 1000) + 24 * 60 * 60

  const tokenConfig = {
    properties: {
      room_name: config.room_name,
      user_id: config.user_id,
      user_name: config.user_name,
      is_owner: config.is_owner ?? false,
      enable_screenshare: config.enable_screenshare ?? true,
      enable_recording: config.is_owner ? (config.enable_recording ?? 'cloud') : false,
      start_cloud_recording: config.start_cloud_recording ?? false,
      start_video_off: config.start_video_off ?? false,
      start_audio_off: config.start_audio_off ?? false,
      exp: config.exp || tokenExpiration,
    },
  }

  return dailyFetch<DailyMeetingToken>('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify(tokenConfig),
  })
}

/**
 * Create a host token (with full permissions)
 */
export async function createHostToken(
  roomName: string,
  userId: string,
  userName: string
): Promise<DailyMeetingToken> {
  return createMeetingToken({
    room_name: roomName,
    user_id: userId,
    user_name: userName,
    is_owner: true,
    enable_screenshare: true,
    enable_recording: 'cloud',
  })
}

/**
 * Create a participant token (limited permissions)
 */
export async function createParticipantToken(
  roomName: string,
  participantId: string,
  participantName: string
): Promise<DailyMeetingToken> {
  return createMeetingToken({
    room_name: roomName,
    user_id: participantId,
    user_name: participantName,
    is_owner: false,
    enable_screenshare: true,
    enable_recording: false,
  })
}

/**
 * Create a guest token (for public join without auth)
 */
export async function createGuestToken(
  roomName: string,
  guestId: string,
  guestName: string
): Promise<DailyMeetingToken> {
  return createMeetingToken({
    room_name: roomName,
    user_id: `guest-${guestId}`,
    user_name: guestName,
    is_owner: false,
    enable_screenshare: true,
    enable_recording: false,
  })
}

// ============================================================================
// RECORDINGS
// ============================================================================

export interface DailyRecording {
  id: string
  room_name: string
  start_ts: number
  duration: number
  max_participants: number
  share_token: string
  status: string
  tracks: string[]
}

interface DailyRecordingAccess {
  download_link: string
  expires: number
}

/**
 * List recordings for a room
 */
export async function listRoomRecordings(roomName: string): Promise<DailyRecording[]> {
  const response = await dailyFetch<{ data: DailyRecording[] }>(
    `/recordings?room_name=${encodeURIComponent(roomName)}`
  )
  return response.data || []
}

/**
 * List ALL recordings from Daily.co account
 */
export async function listAllRecordings(limit: number = 100): Promise<DailyRecording[]> {
  const response = await dailyFetch<{ data: DailyRecording[] }>(
    `/recordings?limit=${limit}`
  )
  return response.data || []
}

/**
 * Get recording access link
 */
export async function getRecordingAccessLink(recordingId: string): Promise<DailyRecordingAccess> {
  return dailyFetch<DailyRecordingAccess>(`/recordings/${recordingId}/access-link`)
}

/**
 * Delete a recording
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  await dailyFetch(`/recordings/${recordingId}`, {
    method: 'DELETE',
  })
}

// ============================================================================
// TRANSCRIPTION (Daily.co native - knows who said what!)
// ============================================================================

interface DailyTranscriptWord {
  text: string
  start_ts: number
  end_ts: number
  confidence: number
}

interface DailyTranscriptUtterance {
  speaker_id: string // Daily participant ID
  speaker_name: string // The actual participant name!
  text: string
  start_ts: number
  end_ts: number
  words: DailyTranscriptWord[]
}

export interface DailyTranscript {
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  text?: string
  utterances?: DailyTranscriptUtterance[]
  duration?: number
  error?: string
}

/**
 * Request transcription for a recording
 * Daily.co knows exactly who said what because it tracks each participant!
 */
export async function requestRecordingTranscript(recordingId: string): Promise<{ transcript_id: string }> {
  return dailyFetch<{ transcript_id: string }>(`/recordings/${recordingId}/transcript`, {
    method: 'POST',
  })
}

/**
 * Get transcript for a recording (with speaker names!)
 */
export async function getRecordingTranscript(recordingId: string): Promise<DailyTranscript> {
  return dailyFetch<DailyTranscript>(`/recordings/${recordingId}/transcript`)
}

/**
 * Check if a recording has a transcript ready
 */
export async function hasTranscript(recordingId: string): Promise<boolean> {
  try {
    const transcript = await getRecordingTranscript(recordingId)
    return transcript.status === 'completed'
  } catch {
    return false
  }
}

// ============================================================================
// PRESENCE
// ============================================================================

interface DailyPresence {
  total_count: number
  data: Array<{
    id: string
    room: string
    user_id: string | null
    user_name: string | null
    join_time: string
    duration: number
  }>
}

/**
 * Get current participants in a room
 */
export async function getRoomPresence(roomName: string): Promise<DailyPresence> {
  return dailyFetch<DailyPresence>(`/presence?room=${encodeURIComponent(roomName)}`)
}

/**
 * Check if a room is active (has participants)
 */
export async function isRoomActive(roomName: string): Promise<boolean> {
  try {
    const presence = await getRoomPresence(roomName)
    return presence.total_count > 0
  } catch {
    return false
  }
}

// ============================================================================
// MEETING URL HELPERS
// ============================================================================

/**
 * Get the full meeting URL for a room
 */
export function getMeetingUrl(roomName: string): string {
  const domain = getDailyDomain()
  return `https://${domain}/${roomName}`
}

/**
 * Get the public join URL with invite code
 */
export function getPublicJoinUrl(inviteCode: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/join/${inviteCode}`
}

// ============================================================================
// WEBHOOK VERIFICATION
// ============================================================================

/**
 * Verify Daily.co webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto')
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  const expectedSignature = hmac.digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
