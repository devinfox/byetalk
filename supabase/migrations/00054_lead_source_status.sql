-- Add source_status field to leads table for importing original status from CSV
-- This is separate from the pipeline status (new, contacted, qualified, etc.)

ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_status TEXT;

-- Add comment for clarity
COMMENT ON COLUMN leads.source_status IS 'Original status value from import source (e.g., "Duplicate accepted")';
