-- ============================================================================
-- BYETALK CRM - Turbo Mode Functions
-- Migration 00040: Missing functions and columns for turbo mode
-- ============================================================================

-- Add voicemail_transcription column to turbo_active_calls
ALTER TABLE turbo_active_calls
ADD COLUMN IF NOT EXISTS voicemail_transcription TEXT;

-- ============================================================================
-- ATOMIC INCREMENT FUNCTIONS
-- These prevent race conditions when multiple concurrent calls update stats
-- ============================================================================

-- Increment session connected count atomically
CREATE OR REPLACE FUNCTION increment_turbo_session_connected(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE turbo_mode_sessions
    SET calls_connected = calls_connected + 1,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$;

-- Increment queue item attempts atomically
CREATE OR REPLACE FUNCTION increment_turbo_queue_attempts(p_queue_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE turbo_call_queue
    SET attempts = attempts + 1,
        last_attempt_at = NOW(),
        status = 'dialing'
    WHERE id = p_queue_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_turbo_session_connected(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_turbo_queue_attempts(UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION increment_turbo_session_connected IS 'Atomically increment the connected calls count for a turbo session';
COMMENT ON FUNCTION increment_turbo_queue_attempts IS 'Atomically increment attempt count and update status for a queue item';
