-- ============================================================================
-- MICROSOFT OUTLOOK INTEGRATION
-- Migration 00033: OAuth tokens, organizations, and email provider support
-- ============================================================================

-- ============================================================================
-- EMAIL PROVIDER ENUM
-- ============================================================================

CREATE TYPE email_provider_type AS ENUM (
    'sendgrid',
    'microsoft',
    'gmail'
);

-- ============================================================================
-- ORGANIZATIONS (Domain-based team grouping)
-- ============================================================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Domain info
    domain VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),

    -- Microsoft/Azure info
    microsoft_tenant_id VARCHAR(255),

    -- Settings
    allow_microsoft_login BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_domain ON organizations(domain);
CREATE INDEX idx_organizations_tenant ON organizations(microsoft_tenant_id) WHERE microsoft_tenant_id IS NOT NULL;

-- ============================================================================
-- MICROSOFT OAUTH TOKENS
-- ============================================================================

CREATE TABLE microsoft_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User link
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- Microsoft account info
    email VARCHAR(255) NOT NULL,
    microsoft_user_id VARCHAR(255),

    -- OAuth tokens (encrypted in production)
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    -- Scopes granted
    scopes TEXT[] NOT NULL DEFAULT '{}',

    -- Sync state
    mail_delta_token TEXT, -- For incremental sync
    last_sync_at TIMESTAMPTZ,
    sync_enabled BOOLEAN DEFAULT TRUE,

    -- Webhook subscription
    webhook_subscription_id VARCHAR(255),
    webhook_expiration TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, email)
);

CREATE INDEX idx_microsoft_tokens_user ON microsoft_oauth_tokens(user_id);
CREATE INDEX idx_microsoft_tokens_email ON microsoft_oauth_tokens(email);
CREATE INDEX idx_microsoft_tokens_expiration ON microsoft_oauth_tokens(expires_at);
CREATE INDEX idx_microsoft_tokens_sync ON microsoft_oauth_tokens(sync_enabled, last_sync_at)
    WHERE sync_enabled = TRUE;

-- ============================================================================
-- ADD ORGANIZATION TO USERS
-- ============================================================================

ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN microsoft_linked BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_users_organization ON users(organization_id) WHERE organization_id IS NOT NULL;

-- ============================================================================
-- ADD PROVIDER SUPPORT TO EMAIL ACCOUNTS
-- ============================================================================

ALTER TABLE email_accounts ADD COLUMN provider email_provider_type DEFAULT 'sendgrid';
ALTER TABLE email_accounts ADD COLUMN microsoft_token_id UUID REFERENCES microsoft_oauth_tokens(id) ON DELETE SET NULL;

-- Make domain_id optional (Microsoft accounts don't need a domain)
ALTER TABLE email_accounts ALTER COLUMN domain_id DROP NOT NULL;

CREATE INDEX idx_email_accounts_provider ON email_accounts(provider) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_accounts_microsoft ON email_accounts(microsoft_token_id)
    WHERE microsoft_token_id IS NOT NULL AND is_deleted = FALSE;

-- ============================================================================
-- ADD PROVIDER TRACKING TO EMAILS
-- ============================================================================

ALTER TABLE emails ADD COLUMN email_provider email_provider_type DEFAULT 'sendgrid';
ALTER TABLE emails ADD COLUMN graph_message_id VARCHAR(255);
ALTER TABLE emails ADD COLUMN graph_conversation_id VARCHAR(255);
ALTER TABLE emails ADD COLUMN graph_internet_message_id VARCHAR(500);

CREATE INDEX idx_emails_provider ON emails(email_provider) WHERE is_deleted = FALSE;
CREATE INDEX idx_emails_graph_message ON emails(graph_message_id)
    WHERE graph_message_id IS NOT NULL AND is_deleted = FALSE;
CREATE INDEX idx_emails_graph_conversation ON emails(graph_conversation_id)
    WHERE graph_conversation_id IS NOT NULL AND is_deleted = FALSE;

-- ============================================================================
-- MICROSOFT SYNC LOG (for debugging and audit)
-- ============================================================================

CREATE TABLE microsoft_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Token link
    token_id UUID REFERENCES microsoft_oauth_tokens(id) ON DELETE CASCADE NOT NULL,

    -- Sync info
    sync_type VARCHAR(50) NOT NULL, -- 'full', 'delta', 'webhook'
    messages_synced INTEGER DEFAULT 0,
    messages_created INTEGER DEFAULT 0,
    messages_updated INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'started', -- 'started', 'completed', 'failed'
    error_message TEXT,

    -- Delta token for next sync
    delta_token_before TEXT,
    delta_token_after TEXT,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_microsoft_sync_log_token ON microsoft_sync_log(token_id);
CREATE INDEX idx_microsoft_sync_log_status ON microsoft_sync_log(status, started_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Organizations (read for anyone in org, write for admins)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (
        id IN (SELECT organization_id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "Admins can manage organizations"
    ON organizations FOR ALL
    USING (
        EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'admin')
    );

-- Microsoft OAuth Tokens (users can only see their own)
ALTER TABLE microsoft_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Microsoft tokens"
    ON microsoft_oauth_tokens FOR ALL
    USING (
        user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Microsoft Sync Log (users can view their sync logs)
ALTER TABLE microsoft_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their sync logs"
    ON microsoft_sync_log FOR SELECT
    USING (
        token_id IN (
            SELECT id FROM microsoft_oauth_tokens
            WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
        )
    );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create organization by domain
CREATE OR REPLACE FUNCTION get_or_create_organization(p_domain VARCHAR(255), p_name VARCHAR(255) DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Try to find existing organization
    SELECT id INTO v_org_id FROM organizations WHERE domain = p_domain;

    IF v_org_id IS NULL THEN
        -- Create new organization
        INSERT INTO organizations (domain, name)
        VALUES (p_domain, COALESCE(p_name, p_domain))
        RETURNING id INTO v_org_id;
    END IF;

    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to link user to organization
CREATE OR REPLACE FUNCTION link_user_to_organization(p_user_id UUID, p_domain VARCHAR(255))
RETURNS VOID AS $$
DECLARE
    v_org_id UUID;
BEGIN
    v_org_id := get_or_create_organization(p_domain);

    UPDATE users SET organization_id = v_org_id WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organizations IS 'Domain-based organization grouping for team management';
COMMENT ON TABLE microsoft_oauth_tokens IS 'Microsoft OAuth2 tokens for Graph API access';
COMMENT ON TABLE microsoft_sync_log IS 'Audit log for Microsoft email sync operations';
COMMENT ON COLUMN users.organization_id IS 'Link to organization (users from same domain are grouped)';
COMMENT ON COLUMN users.microsoft_linked IS 'Whether user authenticated via Microsoft OAuth';
COMMENT ON COLUMN email_accounts.provider IS 'Email provider type: sendgrid, microsoft, or gmail';
COMMENT ON COLUMN emails.graph_message_id IS 'Microsoft Graph API message ID';
COMMENT ON COLUMN emails.graph_conversation_id IS 'Microsoft Graph API conversation ID';
