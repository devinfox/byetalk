-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00006: Audit Logging and Event System
-- ============================================================================

-- ============================================================================
-- ACTIVITY LOG (Comprehensive audit trail)
-- ============================================================================

CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What happened
    event_type event_type NOT NULL,
    event_description TEXT,

    -- Who did it
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255), -- Denormalized for history

    -- What entity was affected
    entity_type VARCHAR(50) NOT NULL, -- deal, lead, contact, call, etc.
    entity_id UUID NOT NULL,

    -- Related entities
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),
    call_id UUID REFERENCES calls(id),

    -- Change details
    changes JSONB, -- {"field": {"old": x, "new": y}, ...}
    old_values JSONB,
    new_values JSONB,

    -- Context
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100), -- For tracing

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamp (immutable)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for activity log
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_deal ON activity_log(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_activity_log_lead ON activity_log(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_activity_log_contact ON activity_log(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_activity_log_event ON activity_log(event_type);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- Composite for common queries
CREATE INDEX idx_activity_log_entity_created ON activity_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_activity_log_deal_created ON activity_log(deal_id, created_at DESC) WHERE deal_id IS NOT NULL;

-- ============================================================================
-- SYSTEM EVENTS (Event bus for automations/webhooks)
-- ============================================================================

CREATE TABLE system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Event identification
    event_type event_type NOT NULL,
    event_name VARCHAR(100) NOT NULL, -- More specific name
    event_version INTEGER DEFAULT 1,

    -- Payload
    payload JSONB NOT NULL,

    -- Related entities
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),
    user_id UUID REFERENCES users(id),

    -- Processing status
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,

    -- Webhook delivery
    webhooks_sent JSONB DEFAULT '[]', -- [{url, status, response_code, sent_at}]

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for system events
CREATE INDEX idx_system_events_type ON system_events(event_type);
CREATE INDEX idx_system_events_status ON system_events(status) WHERE status = 'pending';
CREATE INDEX idx_system_events_deal ON system_events(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_system_events_created ON system_events(created_at DESC);
CREATE INDEX idx_system_events_retry ON system_events(next_retry_at) WHERE status = 'failed' AND retry_count < 5;

-- ============================================================================
-- NOTES (Universal notes for any entity)
-- ============================================================================

CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What this note is attached to
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,

    -- Convenience FKs
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),

    -- Note content
    content TEXT NOT NULL,
    content_html TEXT, -- Rich text version

    -- Authorship
    created_by UUID NOT NULL REFERENCES users(id),

    -- Visibility
    is_private BOOLEAN DEFAULT FALSE, -- Only visible to creator
    is_pinned BOOLEAN DEFAULT FALSE,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_entity ON notes(entity_type, entity_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_notes_deal ON notes(deal_id) WHERE is_deleted = FALSE AND deal_id IS NOT NULL;
CREATE INDEX idx_notes_lead ON notes(lead_id) WHERE is_deleted = FALSE AND lead_id IS NOT NULL;
CREATE INDEX idx_notes_contact ON notes(contact_id) WHERE is_deleted = FALSE AND contact_id IS NOT NULL;
CREATE INDEX idx_notes_created_by ON notes(created_by) WHERE is_deleted = FALSE;
CREATE INDEX idx_notes_pinned ON notes(entity_type, entity_id) WHERE is_deleted = FALSE AND is_pinned = TRUE;

-- ============================================================================
-- TASKS / REMINDERS
-- ============================================================================

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Task details
    title VARCHAR(200) NOT NULL,
    description TEXT,

    -- Assignment
    assigned_to UUID NOT NULL REFERENCES users(id),
    assigned_by UUID REFERENCES users(id),

    -- Related entities
    entity_type VARCHAR(50),
    entity_id UUID,
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),

    -- Scheduling
    due_at TIMESTAMPTZ,
    reminder_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id),

    -- Task type
    task_type VARCHAR(50), -- follow_up, call_back, send_docs, review, etc.

    -- Recurrence (if any)
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule JSONB, -- iCal RRULE format or custom

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_due ON tasks(due_at) WHERE is_deleted = FALSE AND status = 'pending';
CREATE INDEX idx_tasks_deal ON tasks(deal_id) WHERE is_deleted = FALSE AND deal_id IS NOT NULL;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_overdue ON tasks(due_at)
    WHERE is_deleted = FALSE AND status = 'pending' AND due_at < NOW();

-- ============================================================================
-- DOCUMENTS / ATTACHMENTS
-- ============================================================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- File info
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),

    -- Storage
    storage_path TEXT NOT NULL, -- Supabase Storage path
    storage_bucket VARCHAR(100) DEFAULT 'documents',
    public_url TEXT,

    -- Related entities
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    deal_id UUID REFERENCES deals(id),
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),

    -- Document classification
    document_type VARCHAR(50), -- contract, id_verification, statement, etc.
    category VARCHAR(50),

    -- Upload info
    uploaded_by UUID NOT NULL REFERENCES users(id),

    -- Description
    description TEXT,
    tags TEXT[],

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_deal ON documents(deal_id) WHERE is_deleted = FALSE AND deal_id IS NOT NULL;
CREATE INDEX idx_documents_type ON documents(document_type) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by) WHERE is_deleted = FALSE;

-- ============================================================================
-- HELPER FUNCTION: Updated at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'updated_at'
          AND table_name NOT IN ('activity_log', 'system_events')
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

COMMENT ON TABLE activity_log IS 'Immutable audit trail of all system changes';
COMMENT ON TABLE system_events IS 'Event bus for automations, webhooks, and async processing';
COMMENT ON TABLE notes IS 'Universal notes attached to any entity';
COMMENT ON TABLE tasks IS 'Tasks and reminders with assignment and due dates';
COMMENT ON TABLE documents IS 'File attachments with Supabase Storage integration';
