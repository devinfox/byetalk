-- Update count_available_turbo_reps to require conference_sid
-- This ensures the rep has actually connected to their conference before dialing

CREATE OR REPLACE FUNCTION count_available_turbo_reps(
  p_organization_id UUID
)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM turbo_mode_sessions
  WHERE organization_id = p_organization_id
    AND status = 'active'
    AND current_call_sid IS NULL
    AND conference_name IS NOT NULL
    AND conference_sid IS NOT NULL;  -- Conference must actually exist in Twilio
$$ LANGUAGE sql STABLE;

-- Also update claim_available_turbo_rep to require conference_sid
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
    AND tms.conference_name IS NOT NULL  -- Has conference name set
    AND tms.conference_sid IS NOT NULL  -- Conference actually exists in Twilio
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
