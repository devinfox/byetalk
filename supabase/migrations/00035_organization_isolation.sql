-- ============================================================================
-- BYETALK CRM - Database Schema
-- Migration 00035: Organization-Based Multi-Tenancy
--
-- This migration implements full data isolation by organization (domain).
-- All business data is scoped to an organization based on email domain.
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Get Current User's Organization ID
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_organization_id()
RETURNS UUID AS $$
DECLARE
    org_id UUID;
BEGIN
    SELECT organization_id INTO org_id
    FROM users
    WHERE auth_id = auth.uid()
    LIMIT 1;

    RETURN org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_current_organization_id() IS 'Returns the organization_id of the currently authenticated user';

-- ============================================================================
-- ADD organization_id TO CORE TABLES
-- ============================================================================

-- Teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_teams_organization ON teams(organization_id) WHERE is_deleted = FALSE;

-- Campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON campaigns(organization_id) WHERE is_deleted = FALSE;

-- Leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_leads_organization ON leads(organization_id) WHERE is_deleted = FALSE;

-- Contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_contacts_organization ON contacts(organization_id) WHERE is_deleted = FALSE;

-- Deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_deals_organization ON deals(organization_id) WHERE is_deleted = FALSE;

-- Deal Stage History
ALTER TABLE deal_stage_history ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_organization ON deal_stage_history(organization_id);

-- Notes
ALTER TABLE notes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_notes_organization ON notes(organization_id) WHERE is_deleted = FALSE;

-- Tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization ON tasks(organization_id) WHERE is_deleted = FALSE;

-- Documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_documents_organization ON documents(organization_id) WHERE is_deleted = FALSE;

-- Messages (Chat)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_messages_organization ON messages(organization_id) WHERE is_deleted = FALSE;

-- Calls
ALTER TABLE calls ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_calls_organization ON calls(organization_id) WHERE is_deleted = FALSE;

-- Activity Log
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_activity_log_organization ON activity_log(organization_id);

-- System Events
ALTER TABLE system_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_system_events_organization ON system_events(organization_id);

-- Email Templates
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_email_templates_organization ON email_templates(organization_id) WHERE is_deleted = FALSE;

-- Email Funnels
ALTER TABLE email_funnels ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_email_funnels_organization ON email_funnels(organization_id) WHERE is_deleted = FALSE;

-- Emails
ALTER TABLE emails ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_emails_organization ON emails(organization_id);

-- Email Domains
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_email_domains_organization ON email_domains(organization_id);

-- Email Accounts
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_organization ON email_accounts(organization_id);

-- Email Threads
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_email_threads_organization ON email_threads(organization_id) WHERE is_deleted = FALSE;

-- Email Drafts (if exists)
DO $$ BEGIN
    ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    CREATE INDEX IF NOT EXISTS idx_email_drafts_organization ON email_drafts(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Funnel Enrollments (if exists)
DO $$ BEGIN
    ALTER TABLE funnel_enrollments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    CREATE INDEX IF NOT EXISTS idx_funnel_enrollments_organization ON funnel_enrollments(organization_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- BACKFILL EXISTING DATA
-- Set organization_id based on owner/user relationships
-- ============================================================================

-- Backfill teams (from manager's organization)
UPDATE teams t
SET organization_id = u.organization_id
FROM users u
WHERE t.manager_id = u.id
  AND t.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill campaigns (from assigned user's organization)
UPDATE campaigns c
SET organization_id = u.organization_id
FROM users u
WHERE c.assigned_user_id = u.id
  AND c.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill campaigns (from assigned team's org if user not set)
UPDATE campaigns c
SET organization_id = t.organization_id
FROM teams t
WHERE c.assigned_team_id = t.id
  AND c.organization_id IS NULL
  AND t.organization_id IS NOT NULL;

-- Backfill leads (from owner's organization)
UPDATE leads l
SET organization_id = u.organization_id
FROM users u
WHERE l.owner_id = u.id
  AND l.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill contacts (from owner's organization)
UPDATE contacts c
SET organization_id = u.organization_id
FROM users u
WHERE c.owner_id = u.id
  AND c.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill deals (from owner's organization)
UPDATE deals d
SET organization_id = u.organization_id
FROM users u
WHERE d.owner_id = u.id
  AND d.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill deal_stage_history (from deal's organization)
UPDATE deal_stage_history dsh
SET organization_id = d.organization_id
FROM deals d
WHERE dsh.deal_id = d.id
  AND dsh.organization_id IS NULL
  AND d.organization_id IS NOT NULL;

-- Backfill notes (from creator's organization)
UPDATE notes n
SET organization_id = u.organization_id
FROM users u
WHERE n.created_by = u.id
  AND n.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill tasks (from assigned_to user's organization)
UPDATE tasks t
SET organization_id = u.organization_id
FROM users u
WHERE t.assigned_to = u.id
  AND t.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill documents (from uploader's organization)
UPDATE documents d
SET organization_id = u.organization_id
FROM users u
WHERE d.uploaded_by = u.id
  AND d.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill messages (from sender's organization)
UPDATE messages m
SET organization_id = u.organization_id
FROM users u
WHERE m.sender_id = u.id
  AND m.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill calls (from user's organization)
UPDATE calls c
SET organization_id = u.organization_id
FROM users u
WHERE c.user_id = u.id
  AND c.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill activity_log (from user's organization)
UPDATE activity_log al
SET organization_id = u.organization_id
FROM users u
WHERE al.user_id = u.id
  AND al.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill system_events (from user's organization)
UPDATE system_events se
SET organization_id = u.organization_id
FROM users u
WHERE se.user_id = u.id
  AND se.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill email_templates (from created_by user's organization)
UPDATE email_templates et
SET organization_id = u.organization_id
FROM users u
WHERE et.created_by = u.id
  AND et.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill email_funnels (from created_by user's organization)
UPDATE email_funnels ef
SET organization_id = u.organization_id
FROM users u
WHERE ef.created_by = u.id
  AND ef.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill emails (from email_account's user's organization)
UPDATE emails e
SET organization_id = u.organization_id
FROM email_accounts ea
JOIN users u ON ea.user_id = u.id
WHERE e.email_account_id = ea.id
  AND e.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill email_threads (from email_account's user's organization)
UPDATE email_threads et
SET organization_id = u.organization_id
FROM email_accounts ea
JOIN users u ON ea.user_id = u.id
WHERE et.email_account_id = ea.id
  AND et.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill email_domains (from created_by user's organization)
UPDATE email_domains ed
SET organization_id = u.organization_id
FROM users u
WHERE ed.created_by = u.id
  AND ed.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Backfill email_accounts (from user's organization)
UPDATE email_accounts ea
SET organization_id = u.organization_id
FROM users u
WHERE ea.user_id = u.id
  AND ea.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS: Auto-set organization_id on INSERT
-- ============================================================================

-- Generic trigger function to set organization_id from current user
CREATE OR REPLACE FUNCTION set_organization_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := get_current_organization_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to all tables that need auto organization_id
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'teams', 'campaigns', 'leads', 'contacts', 'deals',
        'deal_stage_history', 'notes', 'tasks', 'documents',
        'messages', 'calls', 'activity_log', 'system_events',
        'email_templates', 'email_funnels', 'emails',
        'email_domains', 'email_accounts', 'email_threads'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_%I_organization ON %I;
            CREATE TRIGGER set_%I_organization
                BEFORE INSERT ON %I
                FOR EACH ROW
                EXECUTE FUNCTION set_organization_id();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- ============================================================================
-- UPDATE RLS POLICIES: Add organization-based filtering
-- ============================================================================

-- Helper function to check if user belongs to organization
CREATE OR REPLACE FUNCTION user_belongs_to_organization(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE auth_id = auth.uid()
          AND organization_id = org_id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- TEAMS RLS
-- ============================================================================

DROP POLICY IF EXISTS teams_org_isolation ON teams;
CREATE POLICY teams_org_isolation ON teams
    FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id = get_current_organization_id()
    );

-- ============================================================================
-- CAMPAIGNS RLS
-- ============================================================================

DROP POLICY IF EXISTS campaigns_org_isolation ON campaigns;
CREATE POLICY campaigns_org_isolation ON campaigns
    FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id = get_current_organization_id()
    );

-- ============================================================================
-- LEADS RLS (Update existing policy)
-- ============================================================================

DROP POLICY IF EXISTS leads_org_isolation ON leads;
CREATE POLICY leads_org_isolation ON leads
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- CONTACTS RLS
-- ============================================================================

DROP POLICY IF EXISTS contacts_org_isolation ON contacts;
CREATE POLICY contacts_org_isolation ON contacts
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- DEALS RLS
-- ============================================================================

DROP POLICY IF EXISTS deals_org_isolation ON deals;
CREATE POLICY deals_org_isolation ON deals
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- NOTES RLS
-- ============================================================================

DROP POLICY IF EXISTS notes_org_isolation ON notes;
CREATE POLICY notes_org_isolation ON notes
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- TASKS RLS
-- ============================================================================

DROP POLICY IF EXISTS tasks_org_isolation ON tasks;
CREATE POLICY tasks_org_isolation ON tasks
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- DOCUMENTS RLS
-- ============================================================================

DROP POLICY IF EXISTS documents_org_isolation ON documents;
CREATE POLICY documents_org_isolation ON documents
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- MESSAGES RLS (Update to include organization)
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;
DROP POLICY IF EXISTS messages_update ON messages;
DROP POLICY IF EXISTS messages_org_isolation ON messages;

-- Users can only see messages within their organization
CREATE POLICY messages_org_select ON messages
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
        AND (
            sender_id = get_current_user_id()
            OR recipient_id = get_current_user_id()
        )
    );

-- Users can only send messages within their organization
CREATE POLICY messages_org_insert ON messages
    FOR INSERT
    WITH CHECK (
        sender_id = get_current_user_id()
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
        -- Ensure recipient is in the same organization
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = recipient_id
              AND organization_id = get_current_organization_id()
        )
    );

-- Users can update their own messages (for read status)
CREATE POLICY messages_org_update ON messages
    FOR UPDATE
    USING (
        (sender_id = get_current_user_id() OR recipient_id = get_current_user_id())
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- CALLS RLS
-- ============================================================================

DROP POLICY IF EXISTS calls_org_isolation ON calls;
CREATE POLICY calls_org_isolation ON calls
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- EMAIL TEMPLATES RLS
-- ============================================================================

DROP POLICY IF EXISTS email_templates_org_isolation ON email_templates;
CREATE POLICY email_templates_org_isolation ON email_templates
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- EMAIL FUNNELS RLS
-- ============================================================================

DROP POLICY IF EXISTS email_funnels_org_isolation ON email_funnels;
CREATE POLICY email_funnels_org_isolation ON email_funnels
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- EMAILS RLS
-- ============================================================================

DROP POLICY IF EXISTS emails_org_isolation ON emails;
CREATE POLICY emails_org_isolation ON emails
    FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id = get_current_organization_id()
    );

-- ============================================================================
-- EMAIL THREADS RLS
-- ============================================================================

DROP POLICY IF EXISTS email_threads_org_isolation ON email_threads;
CREATE POLICY email_threads_org_isolation ON email_threads
    FOR ALL
    USING (
        is_deleted = FALSE
        AND (
            organization_id IS NULL
            OR organization_id = get_current_organization_id()
        )
    );

-- ============================================================================
-- EMAIL ACCOUNTS RLS
-- ============================================================================

DROP POLICY IF EXISTS email_accounts_org_isolation ON email_accounts;
CREATE POLICY email_accounts_org_isolation ON email_accounts
    FOR ALL
    USING (
        organization_id IS NULL
        OR organization_id = get_current_organization_id()
    );

-- ============================================================================
-- ACTIVITY LOG RLS
-- ============================================================================

DROP POLICY IF EXISTS activity_log_org_isolation ON activity_log;
CREATE POLICY activity_log_org_isolation ON activity_log
    FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id = get_current_organization_id()
    );

-- ============================================================================
-- SYSTEM EVENTS RLS
-- ============================================================================

DROP POLICY IF EXISTS system_events_org_isolation ON system_events;
CREATE POLICY system_events_org_isolation ON system_events
    FOR SELECT
    USING (
        organization_id IS NULL
        OR organization_id = get_current_organization_id()
    );

-- ============================================================================
-- UPDATE MESSAGE HELPER FUNCTIONS FOR ORGANIZATION FILTERING
-- ============================================================================

-- Update unread message count to filter by organization
CREATE OR REPLACE FUNCTION get_unread_message_count()
RETURNS INTEGER AS $$
    SELECT COALESCE(COUNT(*)::INTEGER, 0)
    FROM messages
    WHERE recipient_id = get_current_user_id()
      AND is_read = FALSE
      AND is_deleted = FALSE
      AND (organization_id IS NULL OR organization_id = get_current_organization_id());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Update unread counts by sender to filter by organization
CREATE OR REPLACE FUNCTION get_unread_counts_by_sender()
RETURNS TABLE(sender_id UUID, unread_count INTEGER) AS $$
    SELECT m.sender_id, COUNT(*)::INTEGER as unread_count
    FROM messages m
    WHERE m.recipient_id = get_current_user_id()
      AND m.is_read = FALSE
      AND m.is_deleted = FALSE
      AND (m.organization_id IS NULL OR m.organization_id = get_current_organization_id())
    GROUP BY m.sender_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get users in same organization (for chat user list)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_organization_users()
RETURNS TABLE(
    id UUID,
    email VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    avatar_url TEXT,
    role user_role,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.avatar_url,
        u.role,
        u.is_active
    FROM users u
    WHERE u.organization_id = get_current_organization_id()
      AND u.is_deleted = FALSE
      AND u.is_active = TRUE
    ORDER BY u.first_name, u.last_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION get_organization_users() IS 'Returns all active users in the current user''s organization';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_current_organization_id() IS 'Returns the organization_id of the currently authenticated user';
COMMENT ON FUNCTION set_organization_id() IS 'Trigger function to auto-set organization_id on insert';
COMMENT ON FUNCTION user_belongs_to_organization(UUID) IS 'Check if current user belongs to the specified organization';
