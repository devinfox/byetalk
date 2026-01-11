-- ============================================================================
-- BYETALK CRM - Database Schema
-- Migration 00041: Video Conferencing (Daily.co Integration)
-- ============================================================================

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Meeting status enum
DO $$ BEGIN
    CREATE TYPE meeting_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Participant role enum
DO $$ BEGIN
    CREATE TYPE meeting_participant_role AS ENUM ('host', 'co_host', 'participant');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Invite status enum
DO $$ BEGIN
    CREATE TYPE meeting_invite_status AS ENUM ('pending', 'accepted', 'declined', 'attended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- MEETINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic info
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status meeting_status NOT NULL DEFAULT 'scheduled',

    -- Scheduling
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Daily.co room info
    daily_room_name VARCHAR(100) UNIQUE,
    daily_room_url TEXT,
    daily_room_config JSONB DEFAULT '{}',

    -- Public invite system
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    max_participants INTEGER DEFAULT 10,
    require_approval BOOLEAN DEFAULT FALSE,

    -- Feature flags
    recording_enabled BOOLEAN DEFAULT TRUE,
    virtual_bg_enabled BOOLEAN DEFAULT TRUE,
    chat_enabled BOOLEAN DEFAULT TRUE,
    screenshare_enabled BOOLEAN DEFAULT TRUE,
    noise_cancellation_enabled BOOLEAN DEFAULT TRUE,

    -- Entity linking (CRM integration)
    entity_type VARCHAR(50) DEFAULT 'global',
    entity_id UUID,
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),
    task_id UUID REFERENCES tasks(id),

    -- Organization (for multi-tenancy)
    organization_id UUID REFERENCES organizations(id),

    -- Ownership
    host_id UUID NOT NULL REFERENCES users(id),

    -- Statistics
    participant_count INTEGER DEFAULT 0,
    max_concurrent_participants INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meetings_host ON meetings(host_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON meetings(scheduled_at) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_meetings_invite_code ON meetings(invite_code) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_meetings_daily_room ON meetings(daily_room_name) WHERE daily_room_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_entity ON meetings(entity_type, entity_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_meetings_task ON meetings(task_id) WHERE is_deleted = FALSE AND task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_organization ON meetings(organization_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_meetings_upcoming ON meetings(scheduled_at) WHERE is_deleted = FALSE AND status = 'scheduled';

-- ============================================================================
-- MEETING PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meeting_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent meeting
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

    -- Participant info (internal users OR external guests)
    user_id UUID REFERENCES users(id),

    -- External participant info (for guests without accounts)
    email VARCHAR(255),
    name VARCHAR(200),

    -- Role and status
    role meeting_participant_role DEFAULT 'participant',
    invite_status meeting_invite_status DEFAULT 'pending',

    -- Attendance tracking
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    join_count INTEGER DEFAULT 0,

    -- Device info
    device_type VARCHAR(50),
    browser VARCHAR(100),

    -- Permissions (can be overridden per participant)
    can_screenshare BOOLEAN DEFAULT TRUE,
    can_record BOOLEAN DEFAULT FALSE,
    is_muted_on_join BOOLEAN DEFAULT FALSE,
    is_video_off_on_join BOOLEAN DEFAULT FALSE,

    -- Invite tracking
    invite_sent_at TIMESTAMPTZ,
    invite_email_id UUID,
    reminder_sent_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique participant per meeting
    CONSTRAINT unique_participant_user UNIQUE (meeting_id, user_id),
    CONSTRAINT unique_participant_email UNIQUE (meeting_id, email),

    -- Ensure either user_id or email is set
    CONSTRAINT participant_identity CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON meeting_participants(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participants_email ON meeting_participants(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_participants_status ON meeting_participants(invite_status);

-- ============================================================================
-- MEETING RECORDINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meeting_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent meeting
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

    -- Recording info
    recording_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'processing',

    -- URLs
    download_url TEXT,
    playback_url TEXT,
    thumbnail_url TEXT,

    -- Metadata
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    format VARCHAR(20) DEFAULT 'mp4',
    resolution VARCHAR(20),

    -- Storage
    storage_provider VARCHAR(50) DEFAULT 'daily',
    storage_path TEXT,
    supabase_storage_url TEXT,

    -- Started by
    started_by_user_id UUID REFERENCES users(id),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Expiration
    expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordings_meeting ON meeting_recordings(meeting_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status ON meeting_recordings(status);
CREATE INDEX IF NOT EXISTS idx_recordings_recording_id ON meeting_recordings(recording_id);

-- ============================================================================
-- MEETING CHAT MESSAGES TABLE (Persistent chat history)
-- ============================================================================

CREATE TABLE IF NOT EXISTS meeting_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent meeting
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

    -- Sender info
    sender_user_id UUID REFERENCES users(id),
    sender_participant_id UUID REFERENCES meeting_participants(id),
    sender_name VARCHAR(200) NOT NULL,

    -- Message content
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',

    -- Attachments (for future use)
    attachments JSONB DEFAULT '[]',

    -- Metadata
    is_system_message BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,

    -- Timestamps
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_meeting ON meeting_chat_messages(meeting_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_chat_sender ON meeting_chat_messages(sender_user_id) WHERE sender_user_id IS NOT NULL;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS meetings_select ON meetings;
DROP POLICY IF EXISTS meetings_insert ON meetings;
DROP POLICY IF EXISTS meetings_update ON meetings;
DROP POLICY IF EXISTS meetings_delete ON meetings;
DROP POLICY IF EXISTS participants_select ON meeting_participants;
DROP POLICY IF EXISTS participants_insert ON meeting_participants;
DROP POLICY IF EXISTS participants_update ON meeting_participants;
DROP POLICY IF EXISTS participants_delete ON meeting_participants;
DROP POLICY IF EXISTS recordings_select ON meeting_recordings;
DROP POLICY IF EXISTS recordings_insert ON meeting_recordings;
DROP POLICY IF EXISTS recordings_delete ON meeting_recordings;
DROP POLICY IF EXISTS chat_select ON meeting_chat_messages;
DROP POLICY IF EXISTS chat_insert ON meeting_chat_messages;

-- Meetings: Host, participants, or same organization
CREATE POLICY meetings_select ON meetings
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            host_id = get_current_user_id()
            OR organization_id = get_current_organization_id()
            OR id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = get_current_user_id())
            OR is_manager_or_above()
        )
    );

CREATE POLICY meetings_insert ON meetings
    FOR INSERT
    WITH CHECK (host_id = get_current_user_id());

CREATE POLICY meetings_update ON meetings
    FOR UPDATE
    USING (
        host_id = get_current_user_id()
        OR organization_id = get_current_organization_id()
        OR is_manager_or_above()
    );

CREATE POLICY meetings_delete ON meetings
    FOR DELETE
    USING (host_id = get_current_user_id() OR is_admin());

-- Participants: Based on meeting access
CREATE POLICY participants_select ON meeting_participants
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_participants.meeting_id
            AND m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
                OR meeting_participants.user_id = get_current_user_id()
            )
        )
    );

CREATE POLICY participants_insert ON meeting_participants
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_participants.meeting_id
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY participants_update ON meeting_participants
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_participants.meeting_id
            AND (
                m.host_id = get_current_user_id()
                OR meeting_participants.user_id = get_current_user_id()
            )
        )
    );

CREATE POLICY participants_delete ON meeting_participants
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_participants.meeting_id
            AND m.host_id = get_current_user_id()
        )
    );

-- Recordings: Based on meeting access, host only for delete
CREATE POLICY recordings_select ON meeting_recordings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_recordings.meeting_id
            AND m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
                OR m.id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = get_current_user_id())
            )
        )
    );

CREATE POLICY recordings_insert ON meeting_recordings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_recordings.meeting_id
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY recordings_delete ON meeting_recordings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_recordings.meeting_id
            AND m.host_id = get_current_user_id()
        )
    );

-- Chat: Based on meeting access
CREATE POLICY chat_select ON meeting_chat_messages
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_chat_messages.meeting_id
            AND m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
                OR m.id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = get_current_user_id())
            )
        )
    );

CREATE POLICY chat_insert ON meeting_chat_messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_chat_messages.meeting_id
            AND (
                m.host_id = get_current_user_id()
                OR m.id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = get_current_user_id())
            )
        )
    );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate invite code function
CREATE OR REPLACE FUNCTION generate_meeting_invite_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
        NEW.invite_code := UPPER(
            SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 3) || '-' ||
            SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 3) || '-' ||
            SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 3)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update participant count function
CREATE OR REPLACE FUNCTION update_meeting_participant_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE meetings SET
            participant_count = participant_count + 1,
            updated_at = NOW()
        WHERE id = NEW.meeting_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE meetings SET
            participant_count = GREATEST(participant_count - 1, 0),
            updated_at = NOW()
        WHERE id = OLD.meeting_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Update meeting timestamps
CREATE OR REPLACE FUNCTION update_meeting_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_generate_meeting_invite_code ON meetings;
DROP TRIGGER IF EXISTS trigger_update_meeting_participant_count ON meeting_participants;
DROP TRIGGER IF EXISTS trigger_update_meeting_timestamp ON meetings;
DROP TRIGGER IF EXISTS set_meetings_organization ON meetings;

-- Generate invite code on insert
CREATE TRIGGER trigger_generate_meeting_invite_code
    BEFORE INSERT ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION generate_meeting_invite_code();

-- Update participant count
CREATE TRIGGER trigger_update_meeting_participant_count
    AFTER INSERT OR DELETE ON meeting_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_meeting_participant_count();

-- Update meeting timestamp
CREATE TRIGGER trigger_update_meeting_timestamp
    BEFORE UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_meeting_timestamp();

-- Auto-set organization_id on insert
CREATE TRIGGER set_meetings_organization
    BEFORE INSERT ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION set_organization_id();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE meetings IS 'Video conference meetings with Daily.co integration';
COMMENT ON TABLE meeting_participants IS 'Meeting attendees (internal users and external guests)';
COMMENT ON TABLE meeting_recordings IS 'Cloud recordings of meetings';
COMMENT ON TABLE meeting_chat_messages IS 'Persistent chat history from meetings';

COMMENT ON COLUMN meetings.invite_code IS 'Public shareable code in ABC-DEF-GHI format';
COMMENT ON COLUMN meetings.daily_room_name IS 'Unique room name in Daily.co';
COMMENT ON COLUMN meetings.daily_room_config IS 'Room configuration JSON from Daily.co';
COMMENT ON COLUMN meeting_participants.user_id IS 'NULL for external guests without accounts';
COMMENT ON COLUMN meeting_recordings.recording_id IS 'Daily.co recording ID';
