-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00052: Additional Lead Import Fields
-- ============================================================================

-- Add new fields for lead import data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_dnc BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_dupe BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dupe_in_file TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rms_result TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rnd_result TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN DEFAULT TRUE;

-- Add comments for documentation
COMMENT ON COLUMN leads.is_dnc IS 'Do Not Call flag from import';
COMMENT ON COLUMN leads.is_dupe IS 'Duplicate flag from import source';
COMMENT ON COLUMN leads.dupe_in_file IS 'Duplicate in file information from import';
COMMENT ON COLUMN leads.rms_result IS 'RMS Result from import source';
COMMENT ON COLUMN leads.rnd_result IS 'RND Result from import source';
COMMENT ON COLUMN leads.is_accepted IS 'Whether lead was accepted in source system';

-- Index for DNC filtering
CREATE INDEX IF NOT EXISTS idx_leads_dnc ON leads(is_dnc) WHERE is_deleted = FALSE;
