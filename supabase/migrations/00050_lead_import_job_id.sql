-- Add import_job_id to leads table to track which import batch a lead came from
ALTER TABLE leads ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES lead_import_jobs(id);

-- Index for efficient queries by import job
CREATE INDEX IF NOT EXISTS idx_leads_import_job_id ON leads(import_job_id) WHERE import_job_id IS NOT NULL;

COMMENT ON COLUMN leads.import_job_id IS 'References the import job this lead was created from (if imported via CSV)';
