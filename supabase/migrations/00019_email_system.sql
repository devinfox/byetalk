-- ============================================================================
-- EMAIL SYSTEM SCHEMA
-- Migration 00019: Full email client with domains, accounts, threads, messages
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE email_folder AS ENUM (
    'inbox',
    'sent',
    'drafts',
    'trash',
    'spam',
    'archive'
);

CREATE TYPE email_status AS ENUM (
    'draft',
    'queued',
    'sending',
    'sent',
    'delivered',
    'opened',
    'clicked',
    'bounced',
    'failed',
    'spam_reported'
);

CREATE TYPE domain_verification_status AS ENUM (
    'pending',
    'verifying',
    'verified',
    'failed'
);

-- ============================================================================
-- EMAIL DOMAINS (Custom domain configuration)
-- ============================================================================

CREATE TABLE email_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Domain info
    domain VARCHAR(255) NOT NULL UNIQUE,

    -- SendGrid domain authentication
    sendgrid_domain_id VARCHAR(100),
    sendgrid_authenticated BOOLEAN DEFAULT FALSE,

    -- Verification status
    verification_status domain_verification_status DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    last_verification_check TIMESTAMPTZ,
    verification_error TEXT,

    -- DNS Records (stored for display to user)
    -- Example: [
    --   { "type": "mx", "host": "@", "value": "mx.sendgrid.net", "priority": 10, "verified": true },
    --   { "type": "txt", "host": "@", "value": "v=spf1 include:sendgrid.net ~all", "verified": false },
    --   { "type": "cname", "host": "em1234", "value": "u1234.wl.sendgrid.net", "verified": true }
    -- ]
    dns_records JSONB DEFAULT '[]'::jsonb,

    -- Inbound email settings
    inbound_enabled BOOLEAN DEFAULT TRUE,

    -- Ownership
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_domains_domain ON email_domains(domain) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_domains_status ON email_domains(verification_status) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_domains_created_by ON email_domains(created_by) WHERE is_deleted = FALSE;

-- ============================================================================
-- EMAIL ACCOUNTS (User email addresses)
-- ============================================================================

CREATE TABLE email_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Account info
    email_address VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(200),

    -- Domain link
    domain_id UUID REFERENCES email_domains(id) ON DELETE CASCADE,

    -- User ownership
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Settings
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Signature
    signature_html TEXT,
    signature_text TEXT,

    -- Auto-reply settings
    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    auto_reply_subject VARCHAR(500),
    auto_reply_body TEXT,
    auto_reply_start TIMESTAMPTZ,
    auto_reply_end TIMESTAMPTZ,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_accounts_user ON email_accounts(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_accounts_domain ON email_accounts(domain_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_accounts_address ON email_accounts(email_address) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_accounts_primary ON email_accounts(user_id, is_primary) WHERE is_deleted = FALSE AND is_primary = TRUE;

-- ============================================================================
-- EMAIL THREADS (Conversation grouping)
-- ============================================================================

CREATE TABLE email_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Thread metadata
    subject VARCHAR(1000),

    -- Participant tracking
    -- Example: [{"email": "john@example.com", "name": "John Doe"}]
    participants JSONB DEFAULT '[]'::jsonb,

    -- Latest activity
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,

    -- Status flags
    has_attachments BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,

    -- Folder/labels
    folder email_folder DEFAULT 'inbox',
    labels TEXT[] DEFAULT '{}',

    -- Account link
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE NOT NULL,

    -- CRM Integration
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_threads_account ON email_threads(email_account_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_threads_folder ON email_threads(email_account_id, folder) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_threads_last_message ON email_threads(email_account_id, last_message_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_threads_starred ON email_threads(email_account_id, is_starred)
    WHERE is_deleted = FALSE AND is_starred = TRUE;
CREATE INDEX idx_email_threads_unread ON email_threads(email_account_id, is_read)
    WHERE is_deleted = FALSE AND is_read = FALSE;
CREATE INDEX idx_email_threads_contact ON email_threads(contact_id) WHERE is_deleted = FALSE AND contact_id IS NOT NULL;
CREATE INDEX idx_email_threads_lead ON email_threads(lead_id) WHERE is_deleted = FALSE AND lead_id IS NOT NULL;
CREATE INDEX idx_email_threads_deal ON email_threads(deal_id) WHERE is_deleted = FALSE AND deal_id IS NOT NULL;

-- Full text search on threads
CREATE INDEX idx_email_threads_search ON email_threads USING gin(
    to_tsvector('english', COALESCE(subject, ''))
) WHERE is_deleted = FALSE;

-- ============================================================================
-- EMAILS (Individual messages)
-- ============================================================================

CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Thread grouping
    thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,

    -- Message identifiers (RFC 5322)
    message_id VARCHAR(500) UNIQUE,
    in_reply_to VARCHAR(500),
    references_header TEXT[], -- Message-ID references for threading

    -- Sender/Recipients
    from_address VARCHAR(255) NOT NULL,
    from_name VARCHAR(200),
    to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
    cc_addresses JSONB DEFAULT '[]'::jsonb,
    bcc_addresses JSONB DEFAULT '[]'::jsonb,
    reply_to_address VARCHAR(255),

    -- Content
    subject VARCHAR(1000),
    body_text TEXT,
    body_html TEXT,
    snippet VARCHAR(500), -- Preview text

    -- Direction
    is_inbound BOOLEAN NOT NULL,

    -- Status & tracking
    status email_status DEFAULT 'draft',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,

    -- SendGrid tracking
    sendgrid_message_id VARCHAR(100),

    -- Attachments flag
    has_attachments BOOLEAN DEFAULT FALSE,

    -- Read status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Stars/importance
    is_starred BOOLEAN DEFAULT FALSE,

    -- Account link
    email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE NOT NULL,

    -- Original raw email headers (for inbound)
    headers JSONB,

    -- Scheduled sending
    scheduled_at TIMESTAMPTZ,

    -- CRM Integration
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
    email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emails_thread ON emails(thread_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_emails_account ON emails(email_account_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_emails_status ON emails(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_emails_sent ON emails(email_account_id, sent_at DESC) WHERE is_deleted = FALSE AND sent_at IS NOT NULL;
CREATE INDEX idx_emails_message_id ON emails(message_id) WHERE is_deleted = FALSE AND message_id IS NOT NULL;
CREATE INDEX idx_emails_in_reply_to ON emails(in_reply_to) WHERE is_deleted = FALSE AND in_reply_to IS NOT NULL;
CREATE INDEX idx_emails_contact ON emails(contact_id) WHERE is_deleted = FALSE AND contact_id IS NOT NULL;
CREATE INDEX idx_emails_lead ON emails(lead_id) WHERE is_deleted = FALSE AND lead_id IS NOT NULL;
CREATE INDEX idx_emails_deal ON emails(deal_id) WHERE is_deleted = FALSE AND deal_id IS NOT NULL;
CREATE INDEX idx_emails_inbound ON emails(email_account_id, is_inbound) WHERE is_deleted = FALSE;
CREATE INDEX idx_emails_scheduled ON emails(scheduled_at) WHERE is_deleted = FALSE AND scheduled_at IS NOT NULL AND status = 'queued';
CREATE INDEX idx_emails_sendgrid ON emails(sendgrid_message_id) WHERE sendgrid_message_id IS NOT NULL;

-- Full text search on emails
CREATE INDEX idx_emails_search ON emails USING gin(
    to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(body_text, '') || ' ' || COALESCE(from_address, ''))
) WHERE is_deleted = FALSE;

-- ============================================================================
-- EMAIL ATTACHMENTS
-- ============================================================================

CREATE TABLE email_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Email link
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE NOT NULL,

    -- File info
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(200),
    size_bytes BIGINT,

    -- Storage
    storage_bucket VARCHAR(100) DEFAULT 'email-attachments',
    storage_path TEXT NOT NULL,
    public_url TEXT,

    -- Content ID for inline images
    content_id VARCHAR(255),
    is_inline BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_email ON email_attachments(email_id);
CREATE INDEX idx_email_attachments_content_id ON email_attachments(content_id) WHERE content_id IS NOT NULL;

-- ============================================================================
-- EMAIL EVENTS (SendGrid webhook events)
-- ============================================================================

CREATE TABLE email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Email reference
    email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
    sendgrid_message_id VARCHAR(100),

    -- Event info
    event_type VARCHAR(50) NOT NULL, -- delivered, opened, clicked, bounced, dropped, spam_report, etc.
    event_timestamp TIMESTAMPTZ NOT NULL,

    -- Event data
    recipient VARCHAR(255),
    url TEXT, -- For click events
    user_agent TEXT,
    ip_address VARCHAR(45),
    bounce_type VARCHAR(50), -- For bounce events
    bounce_reason TEXT,

    -- Raw payload
    raw_payload JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_events_email ON email_events(email_id);
CREATE INDEX idx_email_events_sg_message ON email_events(sendgrid_message_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_timestamp ON email_events(event_timestamp DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update thread stats when email is inserted
CREATE OR REPLACE FUNCTION update_thread_on_email_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE email_threads SET
        message_count = message_count + 1,
        unread_count = CASE WHEN NEW.is_inbound AND NOT NEW.is_read THEN unread_count + 1 ELSE unread_count END,
        last_message_at = GREATEST(last_message_at, NEW.created_at),
        has_attachments = has_attachments OR NEW.has_attachments,
        is_read = CASE WHEN NEW.is_inbound THEN FALSE ELSE is_read END,
        updated_at = NOW()
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_on_email_insert
    AFTER INSERT ON emails
    FOR EACH ROW
    WHEN (NEW.thread_id IS NOT NULL)
    EXECUTE FUNCTION update_thread_on_email_insert();

-- Update thread unread count when email is marked read
CREATE OR REPLACE FUNCTION update_thread_on_email_read()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_read = FALSE AND NEW.is_read = TRUE AND NEW.is_inbound = TRUE THEN
        UPDATE email_threads SET
            unread_count = GREATEST(0, unread_count - 1),
            is_read = (SELECT COUNT(*) = 0 FROM emails WHERE thread_id = NEW.thread_id AND is_inbound = TRUE AND is_read = FALSE AND is_deleted = FALSE),
            updated_at = NOW()
        WHERE id = NEW.thread_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_on_email_read
    AFTER UPDATE OF is_read ON emails
    FOR EACH ROW
    WHEN (NEW.thread_id IS NOT NULL)
    EXECUTE FUNCTION update_thread_on_email_read();

-- Update updated_at timestamps
CREATE TRIGGER update_email_domains_updated_at
    BEFORE UPDATE ON email_domains
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_accounts_updated_at
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_threads_updated_at
    BEFORE UPDATE ON email_threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emails_updated_at
    BEFORE UPDATE ON emails
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for inbox with unread counts per folder
CREATE OR REPLACE VIEW v_email_folder_counts AS
SELECT
    ea.id AS email_account_id,
    ea.user_id,
    et.folder,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE NOT et.is_read) AS unread_count
FROM email_accounts ea
LEFT JOIN email_threads et ON et.email_account_id = ea.id AND et.is_deleted = FALSE
WHERE ea.is_deleted = FALSE
GROUP BY ea.id, ea.user_id, et.folder;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Email domains policies
CREATE POLICY "Users can view domains they created or if admin"
    ON email_domains FOR SELECT
    TO authenticated
    USING (
        created_by = get_current_user_id()
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can create email domains"
    ON email_domains FOR INSERT
    TO authenticated
    WITH CHECK (created_by = get_current_user_id());

CREATE POLICY "Users can update their domains or if admin"
    ON email_domains FOR UPDATE
    TO authenticated
    USING (
        created_by = get_current_user_id()
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can delete their domains or if admin"
    ON email_domains FOR DELETE
    TO authenticated
    USING (
        created_by = get_current_user_id()
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

-- Email accounts policies
CREATE POLICY "Users can view their email accounts"
    ON email_accounts FOR SELECT
    TO authenticated
    USING (
        user_id = get_current_user_id()
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can create their email accounts"
    ON email_accounts FOR INSERT
    TO authenticated
    WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "Users can update their email accounts"
    ON email_accounts FOR UPDATE
    TO authenticated
    USING (
        user_id = get_current_user_id()
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can delete their email accounts"
    ON email_accounts FOR DELETE
    TO authenticated
    USING (
        user_id = get_current_user_id()
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

-- Email threads policies
CREATE POLICY "Users can view their email threads"
    ON email_threads FOR SELECT
    TO authenticated
    USING (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can create email threads for their accounts"
    ON email_threads FOR INSERT
    TO authenticated
    WITH CHECK (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
    );

CREATE POLICY "Users can update their email threads"
    ON email_threads FOR UPDATE
    TO authenticated
    USING (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can delete their email threads"
    ON email_threads FOR DELETE
    TO authenticated
    USING (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

-- Emails policies
CREATE POLICY "Users can view their emails"
    ON emails FOR SELECT
    TO authenticated
    USING (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can create emails for their accounts"
    ON emails FOR INSERT
    TO authenticated
    WITH CHECK (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
    );

CREATE POLICY "Users can update their emails"
    ON emails FOR UPDATE
    TO authenticated
    USING (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can delete their emails"
    ON emails FOR DELETE
    TO authenticated
    USING (
        email_account_id IN (SELECT id FROM email_accounts WHERE user_id = get_current_user_id())
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

-- Email attachments policies
CREATE POLICY "Users can view attachments for their emails"
    ON email_attachments FOR SELECT
    TO authenticated
    USING (
        email_id IN (
            SELECT e.id FROM emails e
            JOIN email_accounts ea ON e.email_account_id = ea.id
            WHERE ea.user_id = get_current_user_id()
        )
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

CREATE POLICY "Users can create attachments for their emails"
    ON email_attachments FOR INSERT
    TO authenticated
    WITH CHECK (
        email_id IN (
            SELECT e.id FROM emails e
            JOIN email_accounts ea ON e.email_account_id = ea.id
            WHERE ea.user_id = get_current_user_id()
        )
    );

CREATE POLICY "Users can delete attachments for their emails"
    ON email_attachments FOR DELETE
    TO authenticated
    USING (
        email_id IN (
            SELECT e.id FROM emails e
            JOIN email_accounts ea ON e.email_account_id = ea.id
            WHERE ea.user_id = get_current_user_id()
        )
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

-- Email events policies
CREATE POLICY "Users can view events for their emails"
    ON email_events FOR SELECT
    TO authenticated
    USING (
        email_id IN (
            SELECT e.id FROM emails e
            JOIN email_accounts ea ON e.email_account_id = ea.id
            WHERE ea.user_id = get_current_user_id()
        )
        OR EXISTS (SELECT 1 FROM users WHERE id = get_current_user_id() AND role IN ('super_admin', 'admin'))
    );

-- Service role can insert events (for webhooks)
CREATE POLICY "Service role can insert email events"
    ON email_events FOR INSERT
    TO service_role
    WITH CHECK (TRUE);
