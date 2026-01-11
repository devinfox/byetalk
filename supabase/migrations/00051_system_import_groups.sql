-- ============================================================================
-- System Import Groups - Default lead lists for AI-generated and manual leads
-- ============================================================================

-- Add is_system flag to identify system-managed import groups
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- Add display_name for user-friendly names (file_name is used for imports)
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

-- Make created_by nullable for system groups
ALTER TABLE lead_import_jobs ALTER COLUMN created_by DROP NOT NULL;

-- Create system import groups for each organization
-- These will be created per-organization when needed via the API

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_jobs_system ON lead_import_jobs(is_system) WHERE is_system = TRUE;
CREATE INDEX IF NOT EXISTS idx_import_jobs_org ON lead_import_jobs(organization_id);

-- Update RLS to allow viewing system groups
DROP POLICY IF EXISTS "Users can view own import jobs" ON lead_import_jobs;
CREATE POLICY "Users can view import jobs" ON lead_import_jobs
    FOR SELECT USING (
        -- System groups are visible to all in the org
        (is_system = TRUE AND organization_id IN (
            SELECT organization_id FROM users WHERE auth_id = auth.uid()
        ))
        OR
        -- User's own imports
        created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
        OR
        -- Admins/managers can see all
        EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

COMMENT ON COLUMN lead_import_jobs.is_system IS 'True for system-managed groups like AI Generated and Individually Added';
COMMENT ON COLUMN lead_import_jobs.display_name IS 'User-friendly display name for the import group';
