-- Temporarily remove conference_sid requirement to allow dialing
-- The conference connection is working but the callback isn't updating conference_sid

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
    -- Removed: AND conference_sid IS NOT NULL
$$ LANGUAGE sql STABLE;

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
  SELECT tms.* INTO claimed_session
  FROM turbo_mode_sessions tms
  WHERE tms.organization_id = p_organization_id
    AND tms.status = 'active'
    AND tms.current_call_sid IS NULL
    AND tms.conference_name IS NOT NULL
    -- Removed: AND tms.conference_sid IS NOT NULL
  ORDER BY tms.last_call_ended_at NULLS FIRST
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed_session IS NULL THEN
    RETURN;
  END IF;

  UPDATE turbo_mode_sessions
  SET current_call_sid = p_call_sid,
      last_call_started_at = NOW()
  WHERE id = claimed_session.id;

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
