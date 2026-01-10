-- Add AI-generated lead profile and coaching fields to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_profile_summary TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_profile_details JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_coaching_tips TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_profile_updated_at TIMESTAMPTZ;

-- ai_profile_summary: Brief 2-3 sentence summary of who this person is
-- ai_profile_details: Structured JSON with detailed analysis:
--   {
--     "demographics": { "age": 72, "location": "Wichita, KS" },
--     "financial_profile": { "investment_capacity": "$260,000", "purchase_history": [...] },
--     "personality_traits": ["cautious", "detail-oriented"],
--     "interests": ["retirement security", "gold IRA"],
--     "objections_history": ["fee concerns", "timing"],
--     "communication_preferences": ["prefers phone calls", "morning availability"],
--     "relationship_stage": "warm lead",
--     "key_notes": ["has existing IRA", "considering rollover"]
--   }
-- ai_coaching_tips: Array of personalized tips for agents
-- ai_profile_updated_at: When the profile was last regenerated

COMMENT ON COLUMN leads.ai_profile_summary IS 'AI-generated brief summary of who this lead is';
COMMENT ON COLUMN leads.ai_profile_details IS 'AI-generated structured profile details as JSON';
COMMENT ON COLUMN leads.ai_coaching_tips IS 'AI-generated coaching tips for agents';
COMMENT ON COLUMN leads.ai_profile_updated_at IS 'When the AI profile was last updated';
