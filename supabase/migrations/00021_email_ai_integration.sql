-- ============================================================================
-- EMAIL AI INTEGRATION
-- Migration 00021: Email-lead linking, AI analysis, and task generation
-- ============================================================================

-- ============================================================================
-- ADD EMAIL_RECEIVED EVENT TYPE
-- ============================================================================

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'email_received';

-- ============================================================================
-- ADD EMAIL_ID TO TASKS TABLE (for email-generated tasks)
-- ============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS email_id UUID REFERENCES emails(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';

-- Add index for email-related tasks
CREATE INDEX IF NOT EXISTS idx_tasks_email ON tasks(email_id) WHERE is_deleted = FALSE AND email_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source) WHERE is_deleted = FALSE;

-- ============================================================================
-- ADD AI ANALYSIS FIELDS TO EMAILS TABLE
-- ============================================================================

-- AI processing status
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_analysis_status ai_analysis_status DEFAULT 'pending';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_tasks_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;

-- AI analysis results
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_sentiment VARCHAR(20); -- positive, neutral, negative
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_sentiment_score DECIMAL(4,3); -- -1 to 1
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_intent VARCHAR(50); -- inquiry, follow_up, complaint, urgent, informational, commitment, request
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_urgency_score INTEGER; -- 0-100
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_action_items TEXT[]; -- Extracted action items
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_key_topics TEXT[]; -- Main topics discussed
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_commitments JSONB; -- [{who, what, when, parsed_due_at}]
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_requests JSONB; -- [{from, to, what, urgency, parsed_due_at}]
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_raw_response JSONB; -- Raw AI response for debugging

-- Index for AI pending queue
CREATE INDEX IF NOT EXISTS idx_emails_ai_pending ON emails(ai_analysis_status, created_at)
    WHERE ai_analysis_status = 'pending' AND is_deleted = FALSE;

-- ============================================================================
-- ADD EMAIL_ID TO ACTIVITY_LOG (for email linking)
-- ============================================================================

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS email_id UUID REFERENCES emails(id);
CREATE INDEX IF NOT EXISTS idx_activity_log_email ON activity_log(email_id) WHERE email_id IS NOT NULL;

-- ============================================================================
-- CREATE EMAIL_LEAD_LINKS TABLE (for many-to-many email-lead relationships)
-- This allows an email to be linked to multiple leads (e.g., CC'd recipients)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_lead_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Email reference
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE NOT NULL,

    -- Lead/Contact reference (one must be set)
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,

    -- Link type
    link_type VARCHAR(50) NOT NULL DEFAULT 'from', -- from, to, cc, bcc, mentioned

    -- Auto-linked or manual
    auto_linked BOOLEAN DEFAULT TRUE,
    linked_by UUID REFERENCES users(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure at least one entity is linked
    CONSTRAINT email_lead_links_entity_check CHECK (lead_id IS NOT NULL OR contact_id IS NOT NULL),

    -- Prevent duplicates
    UNIQUE(email_id, lead_id, link_type),
    UNIQUE(email_id, contact_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_email_lead_links_email ON email_lead_links(email_id);
CREATE INDEX IF NOT EXISTS idx_email_lead_links_lead ON email_lead_links(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_lead_links_contact ON email_lead_links(contact_id) WHERE contact_id IS NOT NULL;

-- RLS for email_lead_links
ALTER TABLE email_lead_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email links for their emails" ON email_lead_links
    FOR SELECT TO authenticated
    USING (
        email_id IN (
            SELECT e.id FROM emails e
            JOIN email_accounts ea ON e.email_account_id = ea.id
            WHERE ea.user_id = get_current_user_id()
        )
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Service role can manage email links" ON email_lead_links
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN tasks.email_id IS 'Reference to email that generated this task (AI-created tasks)';
COMMENT ON COLUMN tasks.source IS 'How task was created: manual, ai_call_analysis, ai_email_analysis, automation, system';
COMMENT ON COLUMN emails.ai_commitments IS 'AI-extracted commitments: [{who, what, when, parsed_due_at}]';
COMMENT ON COLUMN emails.ai_requests IS 'AI-extracted requests: [{from, to, what, urgency, parsed_due_at}]';
COMMENT ON TABLE email_lead_links IS 'Links emails to leads/contacts for activity tracking';
