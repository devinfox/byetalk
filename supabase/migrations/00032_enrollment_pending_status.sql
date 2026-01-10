-- Add pending_approval and rejected status to enrollment_status enum
-- This allows AI-suggested enrollments to be reviewed before becoming active

-- Add new values to the enrollment_status enum
ALTER TYPE enrollment_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE enrollment_status ADD VALUE IF NOT EXISTS 'rejected';

-- Add match_reason column to store why the AI matched this funnel
ALTER TABLE email_funnel_enrollments
ADD COLUMN IF NOT EXISTS match_reason TEXT;

COMMENT ON COLUMN email_funnel_enrollments.match_reason IS 'AI explanation for why this lead was matched to this funnel';

-- Add approval/rejection tracking columns
ALTER TABLE email_funnel_enrollments
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE email_funnel_enrollments
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

ALTER TABLE email_funnel_enrollments
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE email_funnel_enrollments
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id);

COMMENT ON COLUMN email_funnel_enrollments.approved_at IS 'When the pending enrollment was approved';
COMMENT ON COLUMN email_funnel_enrollments.approved_by IS 'User who approved the enrollment';
COMMENT ON COLUMN email_funnel_enrollments.rejected_at IS 'When the pending enrollment was rejected';
COMMENT ON COLUMN email_funnel_enrollments.rejected_by IS 'User who rejected the enrollment';

-- Add index for pending enrollments (commonly queried)
CREATE INDEX IF NOT EXISTS idx_funnel_enrollments_pending
ON email_funnel_enrollments(status)
WHERE status = 'pending_approval';
