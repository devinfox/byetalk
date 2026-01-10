-- Add compliance_warnings column to calls table for tracking unethical/non-compliant statements
-- This stores AI-detected issues like guarantees, misleading claims, pressure tactics, etc.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS compliance_warnings JSONB DEFAULT '[]'::jsonb;

-- Add index for querying calls with compliance issues
CREATE INDEX IF NOT EXISTS idx_calls_compliance_warnings
ON calls USING GIN (compliance_warnings)
WHERE compliance_warnings != '[]'::jsonb;

-- Add a computed column helper view for compliance reporting
CREATE OR REPLACE VIEW calls_with_compliance_issues AS
SELECT
  c.id,
  c.user_id,
  c.lead_id,
  c.contact_id,
  c.started_at,
  c.duration_seconds,
  c.ai_summary,
  c.compliance_warnings,
  jsonb_array_length(c.compliance_warnings) as warning_count,
  u.first_name || ' ' || u.last_name as employee_name,
  l.first_name || ' ' || l.last_name as lead_name
FROM calls c
LEFT JOIN users u ON c.user_id = u.id
LEFT JOIN leads l ON c.lead_id = l.id
WHERE c.compliance_warnings IS NOT NULL
  AND c.compliance_warnings != '[]'::jsonb
  AND c.is_deleted = false
ORDER BY c.started_at DESC;

COMMENT ON COLUMN calls.compliance_warnings IS 'AI-detected compliance issues: [{severity, category, quote, issue, suggestion}]';
