-- Add storage_path column to lead_import_jobs for background processing
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN lead_import_jobs.storage_path IS 'Path to CSV file in Supabase Storage for background processing';
