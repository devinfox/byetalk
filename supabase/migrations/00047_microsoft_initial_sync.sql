-- ============================================================================
-- MICROSOFT EMAIL INITIAL SYNC SUPPORT
-- Migration 00047: Add flag to track initial email history import
-- ============================================================================

-- Add flag to track if initial email sync has been completed
ALTER TABLE microsoft_oauth_tokens
ADD COLUMN initial_sync_completed BOOLEAN DEFAULT FALSE;

-- Add index for finding tokens that need initial sync
CREATE INDEX idx_microsoft_tokens_initial_sync
ON microsoft_oauth_tokens(initial_sync_completed)
WHERE initial_sync_completed = FALSE AND sync_enabled = TRUE;

-- Add comment
COMMENT ON COLUMN microsoft_oauth_tokens.initial_sync_completed IS
'Whether initial email history import has been completed for this account';
