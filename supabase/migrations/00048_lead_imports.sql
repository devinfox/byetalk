-- ============================================================================
-- Lead Import Jobs - Track CSV imports for leads
-- ============================================================================

-- Import job status enum
CREATE TYPE import_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Import jobs table
CREATE TABLE lead_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job info
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER, -- Size in bytes
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    duplicate_rows INTEGER DEFAULT 0,

    -- Status
    status import_status NOT NULL DEFAULT 'pending',
    error_message TEXT,

    -- Field mapping (CSV column -> lead field)
    field_mapping JSONB NOT NULL DEFAULT '{}',

    -- Default values for imported leads
    default_status VARCHAR(50) DEFAULT 'new',
    default_owner_id UUID REFERENCES users(id),
    default_campaign_id UUID REFERENCES campaigns(id),

    -- Settings
    skip_duplicates BOOLEAN DEFAULT TRUE,
    duplicate_check_fields TEXT[] DEFAULT ARRAY['phone', 'email'],

    -- Ownership
    created_by UUID REFERENCES users(id) NOT NULL,
    organization_id UUID REFERENCES organizations(id),

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import errors table (for tracking individual row errors)
CREATE TABLE lead_import_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id UUID REFERENCES lead_import_jobs(id) ON DELETE CASCADE NOT NULL,
    row_number INTEGER NOT NULL,
    row_data JSONB,
    error_message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_import_jobs_status ON lead_import_jobs(status);
CREATE INDEX idx_import_jobs_created_by ON lead_import_jobs(created_by);
CREATE INDEX idx_import_jobs_created_at ON lead_import_jobs(created_at DESC);
CREATE INDEX idx_import_errors_job ON lead_import_errors(import_job_id);

-- RLS policies
ALTER TABLE lead_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_errors ENABLE ROW LEVEL SECURITY;

-- Users can see their own import jobs
CREATE POLICY "Users can view own import jobs" ON lead_import_jobs
    FOR SELECT USING (
        created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM users
            WHERE auth_id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );

-- Users can create import jobs
CREATE POLICY "Users can create import jobs" ON lead_import_jobs
    FOR INSERT WITH CHECK (
        created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Users can update their own import jobs
CREATE POLICY "Users can update own import jobs" ON lead_import_jobs
    FOR UPDATE USING (
        created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Import errors follow the same rules as their parent job
CREATE POLICY "Users can view import errors" ON lead_import_errors
    FOR SELECT USING (
        import_job_id IN (
            SELECT id FROM lead_import_jobs
            WHERE created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
            OR EXISTS (
                SELECT 1 FROM users
                WHERE auth_id = auth.uid()
                AND role IN ('admin', 'manager')
            )
        )
    );

CREATE POLICY "System can insert import errors" ON lead_import_errors
    FOR INSERT WITH CHECK (true);

COMMENT ON TABLE lead_import_jobs IS 'Tracks CSV import jobs for leads';
COMMENT ON TABLE lead_import_errors IS 'Individual row errors during import';
