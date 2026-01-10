-- Add tags column to email_funnels for automatic funnel matching
-- Tags are used by AI call analysis to automatically enroll leads in matching funnels

ALTER TABLE email_funnels
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create GIN index for efficient tag searches
CREATE INDEX IF NOT EXISTS idx_email_funnels_tags ON email_funnels USING GIN(tags);

-- Add comment for documentation
COMMENT ON COLUMN email_funnels.tags IS 'Tags for automatic funnel matching based on call analysis (e.g., inbound_call, interested, needs_education)';

-- Add auto_enroll column to control whether this funnel can be auto-enrolled
ALTER TABLE email_funnels
ADD COLUMN IF NOT EXISTS auto_enroll_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN email_funnels.auto_enroll_enabled IS 'Whether this funnel can receive automatic enrollments from call analysis';
