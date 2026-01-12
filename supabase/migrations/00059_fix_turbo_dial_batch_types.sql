-- Fix get_turbo_dial_batch function - cast phone to text

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
      l.phone::TEXT as lead_phone,
      COALESCE(l.first_name || ' ' || l.last_name, l.phone)::TEXT as lead_name
    FROM turbo_call_queue tcq
    JOIN leads l ON l.id = tcq.lead_id
    WHERE tcq.organization_id = p_organization_id
      AND tcq.status = 'queued'
      AND (tcq.last_attempt_at IS NULL OR tcq.last_attempt_at < NOW() - INTERVAL '5 minutes')
      AND tcq.attempts < 3
      AND l.phone IS NOT NULL
      AND l.is_deleted = FALSE
      AND l.is_dnc = FALSE
    ORDER BY tcq.priority DESC, tcq.added_at ASC
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
