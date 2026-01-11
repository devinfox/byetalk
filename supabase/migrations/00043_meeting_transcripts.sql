-- ============================================================================
-- Meeting Transcripts with Speaker Diarization
-- ============================================================================

-- Meeting transcripts table
CREATE TABLE IF NOT EXISTS meeting_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent meeting/recording
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    recording_id UUID REFERENCES meeting_recordings(id) ON DELETE SET NULL,

    -- Transcription provider info
    provider VARCHAR(50) NOT NULL DEFAULT 'assemblyai', -- assemblyai, daily, whisper
    provider_transcript_id VARCHAR(255),

    -- Full transcript text
    full_text TEXT,

    -- Processing status
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    error_message TEXT,

    -- Metadata
    language VARCHAR(10) DEFAULT 'en',
    confidence_score DECIMAL(5, 4),
    duration_seconds INTEGER,
    word_count INTEGER,
    speaker_count INTEGER,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON meeting_transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_status ON meeting_transcripts(status);

-- Transcript utterances (speaker-labeled segments)
CREATE TABLE IF NOT EXISTS transcript_utterances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent transcript
    transcript_id UUID NOT NULL REFERENCES meeting_transcripts(id) ON DELETE CASCADE,

    -- Speaker info
    speaker_label VARCHAR(50) NOT NULL, -- "Speaker A", "Speaker B" or participant name
    speaker_user_id UUID REFERENCES users(id), -- Linked CRM user if identified
    speaker_participant_id UUID REFERENCES meeting_participants(id),

    -- Content
    text TEXT NOT NULL,

    -- Timing
    start_time_ms INTEGER NOT NULL,
    end_time_ms INTEGER NOT NULL,

    -- Confidence
    confidence DECIMAL(5, 4),

    -- Order
    sequence_number INTEGER NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utterances_transcript ON transcript_utterances(transcript_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_utterances_speaker ON transcript_utterances(speaker_user_id) WHERE speaker_user_id IS NOT NULL;

-- Meeting AI insights (extracted from transcripts)
CREATE TABLE IF NOT EXISTS meeting_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parent transcript
    transcript_id UUID NOT NULL REFERENCES meeting_transcripts(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,

    -- AI Analysis results
    summary TEXT,
    key_topics JSONB DEFAULT '[]', -- Array of topics discussed
    sentiment VARCHAR(50), -- positive, neutral, negative, mixed
    sentiment_score DECIMAL(5, 4),

    -- Action items extracted
    action_items JSONB DEFAULT '[]', -- [{text, assignee_name, assignee_user_id, due_date, priority}]

    -- Commitments and decisions
    commitments JSONB DEFAULT '[]', -- [{speaker, text, context}]
    decisions JSONB DEFAULT '[]', -- [{text, made_by, context}]
    questions JSONB DEFAULT '[]', -- [{text, asked_by, answered}]

    -- Follow-ups
    follow_ups JSONB DEFAULT '[]', -- [{text, responsible_party, timeline}]

    -- Participant insights
    participant_stats JSONB DEFAULT '{}', -- {user_id: {talk_time_seconds, word_count, sentiment}}

    -- AI processing info
    ai_model VARCHAR(100),
    ai_processed_at TIMESTAMPTZ,
    ai_raw_response JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_transcript ON meeting_insights(transcript_id);
CREATE INDEX IF NOT EXISTS idx_insights_meeting ON meeting_insights(meeting_id);

-- Tasks generated from meetings
-- (Uses existing tasks table with entity_type = 'meeting_insight')

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE meeting_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_insights ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS transcripts_select ON meeting_transcripts;
DROP POLICY IF EXISTS transcripts_insert ON meeting_transcripts;
DROP POLICY IF EXISTS utterances_select ON transcript_utterances;
DROP POLICY IF EXISTS utterances_insert ON transcript_utterances;
DROP POLICY IF EXISTS insights_select ON meeting_insights;
DROP POLICY IF EXISTS insights_insert ON meeting_insights;

-- Transcripts: Based on meeting access
CREATE POLICY transcripts_select ON meeting_transcripts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM get_meeting_host_and_org(meeting_transcripts.meeting_id) m
            WHERE m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
        OR is_meeting_participant(meeting_transcripts.meeting_id, get_current_user_id())
    );

CREATE POLICY transcripts_insert ON meeting_transcripts
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM get_meeting_host_and_org(meeting_transcripts.meeting_id) m
            WHERE m.host_id = get_current_user_id()
            OR m.organization_id = get_current_organization_id()
        )
    );

-- Utterances: Based on transcript access
CREATE POLICY utterances_select ON transcript_utterances
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM meeting_transcripts t
            JOIN get_meeting_host_and_org(t.meeting_id) m ON true
            WHERE t.id = transcript_utterances.transcript_id
            AND m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
    );

CREATE POLICY utterances_insert ON transcript_utterances
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM meeting_transcripts t
            JOIN get_meeting_host_and_org(t.meeting_id) m ON true
            WHERE t.id = transcript_utterances.transcript_id
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
    );

-- Insights: Based on meeting access
CREATE POLICY insights_select ON meeting_insights
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM get_meeting_host_and_org(meeting_insights.meeting_id) m
            WHERE m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
        OR is_meeting_participant(meeting_insights.meeting_id, get_current_user_id())
    );

CREATE POLICY insights_insert ON meeting_insights
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM get_meeting_host_and_org(meeting_insights.meeting_id) m
            WHERE m.host_id = get_current_user_id()
            OR m.organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE meeting_transcripts IS 'Full transcripts of meeting recordings with speaker diarization';
COMMENT ON TABLE transcript_utterances IS 'Individual speaker segments within a transcript';
COMMENT ON TABLE meeting_insights IS 'AI-extracted insights, action items, and analysis from transcripts';
COMMENT ON COLUMN transcript_utterances.speaker_label IS 'Default speaker label (Speaker A, B) or identified name';
COMMENT ON COLUMN meeting_insights.action_items IS 'JSON array of action items with assignees and due dates';
