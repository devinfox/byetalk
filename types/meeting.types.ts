// Meeting status
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

// Participant role
export type MeetingParticipantRole = 'host' | 'co_host' | 'participant'

// Invite status
export type MeetingInviteStatus = 'pending' | 'accepted' | 'declined' | 'attended'

// Recording status
export type RecordingStatus = 'processing' | 'ready' | 'failed' | 'deleted'

// ============================================================================
// MEETINGS
// ============================================================================

export interface Meeting {
  id: string
  title: string
  description: string | null
  status: MeetingStatus

  // Scheduling
  scheduled_at: string
  duration_minutes: number
  started_at: string | null
  ended_at: string | null

  // Daily.co room info
  daily_room_name: string | null
  daily_room_url: string | null
  daily_room_config: Record<string, unknown>

  // Public invite system
  invite_code: string
  is_public: boolean
  max_participants: number
  require_approval: boolean

  // Feature flags
  recording_enabled: boolean
  virtual_bg_enabled: boolean
  chat_enabled: boolean
  screenshare_enabled: boolean
  noise_cancellation_enabled: boolean

  // Entity linking
  entity_type: string
  entity_id: string | null
  deal_id: string | null
  lead_id: string | null
  contact_id: string | null
  task_id: string | null

  // Organization
  organization_id: string | null

  // Ownership
  host_id: string

  // Statistics
  participant_count: number
  max_concurrent_participants: number
  total_duration_seconds: number

  // Soft delete
  is_deleted: boolean
  deleted_at: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Joined fields
  host?: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string | null
    email: string
  }
  participants?: MeetingParticipant[]
  recordings?: MeetingRecording[]
  lead?: {
    id: string
    first_name: string | null
    last_name: string | null
  } | null
  contact?: {
    id: string
    first_name: string
    last_name: string
  } | null
  deal?: {
    id: string
    name: string
  } | null
  task?: {
    id: string
    title: string
  } | null
}

export interface MeetingInsert {
  title: string
  description?: string
  scheduled_at: string
  duration_minutes?: number
  is_public?: boolean
  max_participants?: number
  require_approval?: boolean
  recording_enabled?: boolean
  virtual_bg_enabled?: boolean
  chat_enabled?: boolean
  screenshare_enabled?: boolean
  noise_cancellation_enabled?: boolean
  deal_id?: string
  lead_id?: string
  contact_id?: string
}

export interface MeetingUpdate {
  title?: string
  description?: string
  status?: MeetingStatus
  scheduled_at?: string
  duration_minutes?: number
  started_at?: string
  ended_at?: string
  is_public?: boolean
  max_participants?: number
  require_approval?: boolean
  recording_enabled?: boolean
  virtual_bg_enabled?: boolean
  chat_enabled?: boolean
  screenshare_enabled?: boolean
  noise_cancellation_enabled?: boolean
}

// ============================================================================
// MEETING PARTICIPANTS
// ============================================================================

export interface MeetingParticipant {
  id: string
  meeting_id: string

  // Identity
  user_id: string | null
  email: string | null
  name: string | null

  // Role and status
  role: MeetingParticipantRole
  invite_status: MeetingInviteStatus

  // Attendance
  joined_at: string | null
  left_at: string | null
  duration_seconds: number
  join_count: number

  // Device info
  device_type: string | null
  browser: string | null

  // Permissions
  can_screenshare: boolean
  can_record: boolean
  is_muted_on_join: boolean
  is_video_off_on_join: boolean

  // Invite tracking
  invite_sent_at: string | null
  invite_email_id: string | null
  reminder_sent_at: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Joined fields
  user?: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string | null
    email: string
  }
}

export interface ParticipantInsert {
  meeting_id: string
  user_id?: string
  email?: string
  name?: string
  role?: MeetingParticipantRole
  can_screenshare?: boolean
  can_record?: boolean
  is_muted_on_join?: boolean
  is_video_off_on_join?: boolean
}

export interface ParticipantUpdate {
  role?: MeetingParticipantRole
  invite_status?: MeetingInviteStatus
  joined_at?: string
  left_at?: string
  can_screenshare?: boolean
  can_record?: boolean
}

// ============================================================================
// MEETING RECORDINGS
// ============================================================================

export interface MeetingRecording {
  id: string
  meeting_id: string

  // Recording info
  recording_id: string
  status: RecordingStatus | string

  // URLs
  download_url: string | null
  playback_url: string | null
  thumbnail_url: string | null

  // Metadata
  duration_seconds: number | null
  file_size_bytes: number | null
  format: string
  resolution: string | null

  // Storage
  storage_provider: string
  storage_path: string | null
  supabase_storage_url: string | null

  // Started by
  started_by_user_id: string | null
  started_at: string | null
  ended_at: string | null

  // Expiration
  expires_at: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Joined fields
  started_by?: {
    id: string
    first_name: string
    last_name: string
  }
}

export interface RecordingInsert {
  meeting_id: string
  recording_id: string
  status?: string
  download_url?: string
  playback_url?: string
  duration_seconds?: number
  file_size_bytes?: number
  format?: string
  resolution?: string
  started_by_user_id?: string
  started_at?: string
  ended_at?: string
  expires_at?: string
}

// ============================================================================
// MEETING CHAT
// ============================================================================

export interface MeetingChatMessage {
  id: string
  meeting_id: string

  // Sender
  sender_user_id: string | null
  sender_participant_id: string | null
  sender_name: string

  // Content
  message: string
  message_type: 'text' | 'file' | 'reaction'
  attachments: unknown[]

  // Metadata
  is_system_message: boolean
  is_deleted: boolean

  // Timestamps
  sent_at: string
  edited_at: string | null

  // Joined fields
  sender?: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string | null
  }
}

export interface ChatMessageInsert {
  meeting_id: string
  sender_user_id?: string
  sender_participant_id?: string
  sender_name: string
  message: string
  message_type?: 'text' | 'file' | 'reaction'
  is_system_message?: boolean
}

// ============================================================================
// DAILY.CO TYPES
// ============================================================================

export interface DailyRoomConfig {
  name?: string
  privacy?: 'public' | 'private'
  properties?: {
    max_participants?: number
    enable_screenshare?: boolean
    enable_chat?: boolean
    enable_knocking?: boolean
    enable_recording?: 'cloud' | 'local' | false
    enable_transcription?: boolean  // Auto-transcribe recordings
    enable_advanced_chat?: boolean
    enable_network_ui?: boolean
    enable_noise_cancellation_ui?: boolean
    enable_prejoin_ui?: boolean
    start_video_off?: boolean
    start_audio_off?: boolean
    start_cloud_recording?: boolean  // Auto-start recording when meeting begins
    exp?: number
    eject_at_room_exp?: boolean
  }
}

export interface DailyRoom {
  id: string
  name: string
  api_created: boolean
  privacy: 'public' | 'private'
  url: string
  created_at: string
  config: DailyRoomConfig['properties']
}

export interface DailyMeetingToken {
  token: string
}

export interface DailyTokenConfig {
  room_name: string
  user_id?: string
  user_name?: string
  is_owner?: boolean
  enable_screenshare?: boolean
  enable_recording?: 'cloud' | 'local' | false
  start_cloud_recording?: boolean
  start_video_off?: boolean
  start_audio_off?: boolean
  exp?: number
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface MeetingListResponse {
  meetings: Meeting[]
  total: number
  page: number
  pageSize: number
}

export interface JoinMeetingResponse {
  meeting: Meeting
  token: string
  roomUrl: string
  participant: MeetingParticipant
}

export interface PublicJoinResponse {
  meeting: {
    id: string
    title: string
    host_name: string
    scheduled_at: string
    status: MeetingStatus
  }
  token: string
  roomUrl: string
  participantId: string
}
