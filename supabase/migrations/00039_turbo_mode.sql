-- ============================================================================
-- BYETALK CRM - Turbo Mode (Predictive Autodialer)
-- Migration 00039: Turbo mode tables for shared calling pool
-- ============================================================================

-- Turbo mode session status
CREATE TYPE turbo_session_status AS ENUM ('active', 'paused', 'ended');

-- Turbo call status
CREATE TYPE turbo_call_status AS ENUM (
    'queued',      -- In queue waiting to be dialed
    'dialing',     -- Call initiated, not yet ringing
    'ringing',     -- Phone is ringing
    'answered',    -- Lead answered, looking for rep
    'connected',   -- Connected to a rep
    'completed',   -- Call finished normally
    'failed',      -- Call failed (error)
    'no_answer',   -- No answer / voicemail
    'busy'         -- Line busy
);

-- ============================================================================
-- TURBO MODE SESSIONS
-- Track who's currently in turbo mode
-- ============================================================================

CREATE TABLE turbo_mode_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    status turbo_session_status NOT NULL DEFAULT 'active',

    -- Session timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,

    -- Stats
    calls_made INTEGER DEFAULT 0,
    calls_connected INTEGER DEFAULT 0,
    total_talk_time_seconds INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turbo_sessions_user ON turbo_mode_sessions(user_id);
CREATE INDEX idx_turbo_sessions_org ON turbo_mode_sessions(organization_id);
CREATE INDEX idx_turbo_sessions_active ON turbo_mode_sessions(organization_id, status)
    WHERE status = 'active';

-- ============================================================================
-- TURBO CALL QUEUE
-- Shared lead queue for turbo dialing
-- ============================================================================

CREATE TABLE turbo_call_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    lead_id UUID NOT NULL REFERENCES leads(id),

    -- Queue management
    priority INTEGER DEFAULT 0, -- Higher = dialed first
    status turbo_call_status DEFAULT 'queued',

    -- Tracking
    added_by UUID REFERENCES users(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),

    -- Attempt tracking
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_after TIMESTAMPTZ, -- For retry scheduling

    -- Outcome
    last_disposition VARCHAR(50),

    -- Prevent duplicate leads in queue
    UNIQUE(organization_id, lead_id)
);

CREATE INDEX idx_turbo_queue_org ON turbo_call_queue(organization_id);
CREATE INDEX idx_turbo_queue_status ON turbo_call_queue(organization_id, status)
    WHERE status = 'queued';
CREATE INDEX idx_turbo_queue_priority ON turbo_call_queue(organization_id, priority DESC, added_at ASC)
    WHERE status = 'queued';

-- ============================================================================
-- TURBO ACTIVE CALLS
-- Track calls currently being dialed/in progress
-- ============================================================================

CREATE TABLE turbo_active_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_item_id UUID NOT NULL REFERENCES turbo_call_queue(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Call details
    call_sid VARCHAR(100),
    caller_id VARCHAR(20) NOT NULL,
    lead_id UUID NOT NULL REFERENCES leads(id),
    lead_phone VARCHAR(20) NOT NULL,
    lead_name VARCHAR(200),

    -- Status
    status turbo_call_status DEFAULT 'dialing',

    -- Assignment
    initiated_by UUID REFERENCES users(id), -- Who triggered the dial batch
    assigned_to UUID REFERENCES users(id),  -- Who got connected
    session_id UUID REFERENCES turbo_mode_sessions(id),

    -- Timestamps
    dialed_at TIMESTAMPTZ DEFAULT NOW(),
    ringing_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Link to main calls table
    call_id UUID REFERENCES calls(id),

    -- Recording
    recording_url TEXT,
    voicemail_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turbo_active_org ON turbo_active_calls(organization_id);
CREATE INDEX idx_turbo_active_status ON turbo_active_calls(organization_id, status);
CREATE INDEX idx_turbo_active_call_sid ON turbo_active_calls(call_sid);
CREATE INDEX idx_turbo_active_session ON turbo_active_calls(session_id);
CREATE INDEX idx_turbo_active_assigned ON turbo_active_calls(assigned_to)
    WHERE status IN ('answered', 'connected');

-- ============================================================================
-- TWILIO NUMBER POOL
-- Cache Twilio numbers for area code matching
-- ============================================================================

CREATE TABLE twilio_phone_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    phone_sid VARCHAR(100),
    area_code VARCHAR(10),
    friendly_name VARCHAR(200),

    -- Usage tracking
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_twilio_numbers_area ON twilio_phone_numbers(area_code) WHERE is_active = TRUE;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE turbo_mode_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE turbo_call_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE turbo_active_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE twilio_phone_numbers ENABLE ROW LEVEL SECURITY;

-- Sessions: Same organization
CREATE POLICY turbo_sessions_select ON turbo_mode_sessions
    FOR SELECT USING (organization_id = get_current_organization_id());

CREATE POLICY turbo_sessions_insert ON turbo_mode_sessions
    FOR INSERT WITH CHECK (user_id = get_current_user_id());

CREATE POLICY turbo_sessions_update ON turbo_mode_sessions
    FOR UPDATE USING (user_id = get_current_user_id() OR organization_id = get_current_organization_id());

-- Queue: Same organization
CREATE POLICY turbo_queue_select ON turbo_call_queue
    FOR SELECT USING (organization_id = get_current_organization_id());

CREATE POLICY turbo_queue_insert ON turbo_call_queue
    FOR INSERT WITH CHECK (organization_id = get_current_organization_id());

CREATE POLICY turbo_queue_update ON turbo_call_queue
    FOR UPDATE USING (organization_id = get_current_organization_id());

CREATE POLICY turbo_queue_delete ON turbo_call_queue
    FOR DELETE USING (organization_id = get_current_organization_id());

-- Active calls: Same organization
CREATE POLICY turbo_active_select ON turbo_active_calls
    FOR SELECT USING (organization_id = get_current_organization_id());

CREATE POLICY turbo_active_insert ON turbo_active_calls
    FOR INSERT WITH CHECK (organization_id = get_current_organization_id());

CREATE POLICY turbo_active_update ON turbo_active_calls
    FOR UPDATE USING (organization_id = get_current_organization_id());

-- Twilio numbers: Anyone can read (for area code matching)
CREATE POLICY twilio_numbers_select ON twilio_phone_numbers
    FOR SELECT USING (TRUE);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get next available rep in turbo mode
CREATE OR REPLACE FUNCTION get_available_turbo_rep(p_organization_id UUID)
RETURNS TABLE(user_id UUID, session_id UUID, client_identity TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.user_id,
        s.id as session_id,
        (u.first_name || '_' || u.last_name || '_' || LEFT(u.id::text, 8)) as client_identity
    FROM turbo_mode_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.organization_id = p_organization_id
      AND s.status = 'active'
      AND NOT EXISTS (
          -- Rep not currently on an active call
          SELECT 1 FROM turbo_active_calls ac
          WHERE ac.assigned_to = s.user_id
            AND ac.status IN ('connected')
      )
    ORDER BY s.started_at ASC -- FIFO for fairness
    LIMIT 1;
END;
$$;

-- Get next batch of leads to dial
CREATE OR REPLACE FUNCTION get_turbo_dial_batch(p_organization_id UUID, p_batch_size INTEGER DEFAULT 3)
RETURNS TABLE(queue_id UUID, lead_id UUID, lead_phone VARCHAR, lead_name TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id as queue_id,
        q.lead_id,
        l.phone as lead_phone,
        (l.first_name || ' ' || l.last_name) as lead_name
    FROM turbo_call_queue q
    JOIN leads l ON l.id = q.lead_id
    WHERE q.organization_id = p_organization_id
      AND q.status = 'queued'
      AND l.phone IS NOT NULL
      AND (q.next_attempt_after IS NULL OR q.next_attempt_after <= NOW())
    ORDER BY q.priority DESC, q.added_at ASC
    LIMIT p_batch_size;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_turbo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER turbo_sessions_updated
    BEFORE UPDATE ON turbo_mode_sessions
    FOR EACH ROW EXECUTE FUNCTION update_turbo_updated_at();

CREATE TRIGGER turbo_active_updated
    BEFORE UPDATE ON turbo_active_calls
    FOR EACH ROW EXECUTE FUNCTION update_turbo_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE turbo_mode_sessions IS 'Tracks which reps are currently in turbo/predictive dialer mode';
COMMENT ON TABLE turbo_call_queue IS 'Shared organization-wide queue of leads to be called in turbo mode';
COMMENT ON TABLE turbo_active_calls IS 'Calls currently being dialed or in progress as part of turbo mode';
COMMENT ON TABLE twilio_phone_numbers IS 'Cached Twilio phone numbers for area code matching';
