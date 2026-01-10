-- Add AI-generated tags to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_tags JSONB;

-- ai_tags structure:
-- [
--   {"label": "401k", "category": "investment"},
--   {"label": "$50k-100k", "category": "budget"},
--   {"label": "Friendly", "category": "personality"},
--   {"label": "Spousal Involvement", "category": "situation"},
--   {"label": "Great Rapport", "category": "relationship"}
-- ]

COMMENT ON COLUMN leads.ai_tags IS 'AI-generated tags for quick lead insights';
