-- Add function to increment calls_made counter for turbo sessions
-- This was missing, causing "0 dialed" to always show

CREATE OR REPLACE FUNCTION increment_turbo_session_dialed(
  p_session_id UUID,
  p_count INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE turbo_mode_sessions
    SET calls_made = calls_made + p_count,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_turbo_session_dialed(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION increment_turbo_session_dialed IS 'Atomically increment the dialed calls count for a turbo session';
