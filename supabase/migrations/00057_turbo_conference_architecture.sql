-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00057: Conference-Based Turbo Mode Architecture
--
-- Implements pool-based predictive dialer with:
-- - Pre-connected reps waiting in personal conferences
-- - Atomic rep claiming to prevent race conditions
-- - Automatic overflow to next available rep
-- ============================================================================

-- ============================================================================
-- UPDATE TURBO_MODE_SESSIONS TABLE
-- ============================================================================

-- Add conference tracking columns
ALTER TABLE turbo_mode_sessions
ADD COLUMN IF NOT EXISTS conference_name TEXT,
ADD COLUMN IF NOT EXISTS conference_sid TEXT,
ADD COLUMN IF NOT EXISTS last_call_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_call_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_call_sid TEXT;

-- Update status enum to include new states
-- Status: 'active' -> 'waiting' | 'on_call' | 'wrap_up' | 'paused' | 'ended'
-- We'll use the existing 'active' and 'ended', adding behavior via the new columns

-- Index for finding available reps quickly
CREATE INDEX IF NOT EXISTS idx_turbo_sessions_available
ON turbo_mode_sessions(organization_id, status, last_call_ended_at)
WHERE status = 'active';

-- ============================================================================
-- ADD TRACKING TO TURBO_ACTIVE_CALLS
-- ============================================================================

ALTER TABLE turbo_active_calls
ADD COLUMN IF NOT EXISTS batch_id UUID,
ADD COLUMN IF NOT EXISTS is_first_answer BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS conference_name TEXT;

-- Index for finding calls by batch
CREATE INDEX IF NOT EXISTS idx_turbo_calls_batch
ON turbo_active_calls(batch_id, status);

-- ============================================================================
-- ATOMIC REP CLAIMING FUNCTION
-- This prevents race conditions when multiple leads answer simultaneously
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_available_turbo_rep(
  p_organization_id UUID,
  p_call_sid TEXT
)
RETURNS TABLE(
  user_id UUID,
  session_id UUID,
  conference_name TEXT,
  client_identity TEXT
) AS $$
DECLARE
  claimed_session RECORD;
  user_record RECORD;
BEGIN
  -- Atomically find and claim a waiting rep using FOR UPDATE SKIP LOCKED
  -- This ensures only one call can claim a rep even with concurrent requests
  SELECT tms.* INTO claimed_session
  FROM turbo_mode_sessions tms
  WHERE tms.organization_id = p_organization_id
    AND tms.status = 'active'
    AND tms.current_call_sid IS NULL  -- Not currently on a call
    AND tms.conference_name IS NOT NULL  -- Has joined their conference
  ORDER BY tms.last_call_ended_at NULLS FIRST  -- Fair rotation - longest waiting gets next call
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- Skip if another transaction is claiming this row

  IF claimed_session IS NULL THEN
    -- No available rep
    RETURN;
  END IF;

  -- Mark rep as on call
  UPDATE turbo_mode_sessions
  SET current_call_sid = p_call_sid,
      last_call_started_at = NOW()
  WHERE id = claimed_session.id;

  -- Get user info for client identity
  SELECT * INTO user_record
  FROM users
  WHERE id = claimed_session.user_id;

  RETURN QUERY
  SELECT
    claimed_session.user_id,
    claimed_session.id,
    claimed_session.conference_name,
    (user_record.first_name || '_' || user_record.last_name || '_' || LEFT(user_record.id::text, 8))::TEXT as client_identity;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_available_turbo_rep IS
'Atomically claims an available rep for an answered call. Returns NULL if no rep available.';

-- ============================================================================
-- RELEASE REP FUNCTION
-- Called when a call ends to return rep to the available pool
-- ============================================================================

CREATE OR REPLACE FUNCTION release_turbo_rep(
  p_session_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE turbo_mode_sessions
  SET current_call_sid = NULL,
      last_call_ended_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION release_turbo_rep IS
'Releases a rep back to the available pool after a call ends.';

-- ============================================================================
-- COUNT AVAILABLE REPS FUNCTION
-- Used to determine how many leads to dial
-- ============================================================================

CREATE OR REPLACE FUNCTION count_available_turbo_reps(
  p_organization_id UUID
)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM turbo_mode_sessions
  WHERE organization_id = p_organization_id
    AND status = 'active'
    AND current_call_sid IS NULL
    AND conference_name IS NOT NULL;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION count_available_turbo_reps IS
'Returns the number of reps currently waiting for calls.';

-- ============================================================================
-- GET BATCH CALLS FUNCTION
-- Get all calls from the same batch (for cancellation)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_batch_call_sids(
  p_batch_id UUID,
  p_exclude_call_sid TEXT
)
RETURNS TABLE(call_sid TEXT) AS $$
  SELECT tac.call_sid
  FROM turbo_active_calls tac
  WHERE tac.batch_id = p_batch_id
    AND tac.call_sid != p_exclude_call_sid
    AND tac.status IN ('dialing', 'ringing');
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_batch_call_sids IS
'Returns call SIDs from the same batch, excluding the specified call. Used for cancellation.';

-- ============================================================================
-- UPDATE GET_TURBO_DIAL_BATCH TO SUPPORT POOL-BASED DIALING
-- ============================================================================

-- Drop existing function first (different return type)
DROP FUNCTION IF EXISTS get_turbo_dial_batch(UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_turbo_dial_batch(
  p_organization_id UUID,
  p_batch_size INTEGER DEFAULT 3
)
RETURNS TABLE(
  queue_id UUID,
  lead_id UUID,
  lead_phone TEXT,
  lead_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH available_leads AS (
    SELECT
      tcq.id as queue_id,
      tcq.lead_id,
      l.phone as lead_phone,
      COALESCE(l.first_name || ' ' || l.last_name, l.phone) as lead_name
    FROM turbo_call_queue tcq
    JOIN leads l ON l.id = tcq.lead_id
    WHERE tcq.organization_id = p_organization_id
      AND tcq.status = 'queued'
      AND (tcq.last_attempt_at IS NULL OR tcq.last_attempt_at < NOW() - INTERVAL '5 minutes')
      AND tcq.attempts < 3
      AND l.phone IS NOT NULL
      AND l.is_deleted = FALSE
      AND l.is_dnc = FALSE
    ORDER BY tcq.priority DESC, tcq.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF tcq SKIP LOCKED
  )
  UPDATE turbo_call_queue tcq
  SET status = 'dialing',
      last_attempt_at = NOW()
  FROM available_leads al
  WHERE tcq.id = al.queue_id
  RETURNING al.queue_id, al.lead_id, al.lead_phone, al.lead_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN turbo_mode_sessions.conference_name IS 'Unique conference name for this rep: turbo_{user_id}_{session_id}';
COMMENT ON COLUMN turbo_mode_sessions.conference_sid IS 'Twilio Conference SID once created';
COMMENT ON COLUMN turbo_mode_sessions.current_call_sid IS 'Call SID currently connected to this rep, NULL if waiting';
COMMENT ON COLUMN turbo_mode_sessions.last_call_started_at IS 'When the current/last call started';
COMMENT ON COLUMN turbo_mode_sessions.last_call_ended_at IS 'When the last call ended, used for fair rotation';
COMMENT ON COLUMN turbo_active_calls.batch_id IS 'Groups calls that were dialed together';
COMMENT ON COLUMN turbo_active_calls.is_first_answer IS 'Whether this was the first call answered in its batch';
