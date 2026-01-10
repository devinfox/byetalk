-- Email Funnels (Drip Campaigns) System
-- Allows creating multi-phase automated email sequences

-- Funnel status enum
CREATE TYPE funnel_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- Enrollment status enum
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'paused', 'cancelled');

-- Main funnels table
CREATE TABLE email_funnels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    status funnel_status DEFAULT 'draft',

    -- Stats (denormalized for performance)
    total_enrolled INT DEFAULT 0,
    total_completed INT DEFAULT 0,
    total_emails_sent INT DEFAULT 0,
    total_opens INT DEFAULT 0,
    total_clicks INT DEFAULT 0,

    created_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funnel phases (each step in the funnel)
CREATE TABLE email_funnel_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    funnel_id UUID NOT NULL REFERENCES email_funnels(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id),

    phase_order INT NOT NULL,  -- 1, 2, 3, etc.
    name VARCHAR(100),  -- Optional name like "Welcome", "Follow Up 1"
    delay_days INT NOT NULL DEFAULT 0,  -- Days after previous phase (0 for first phase = immediate)
    delay_hours INT DEFAULT 0,  -- Additional hours for more precise timing

    -- Phase-specific stats
    emails_sent INT DEFAULT 0,
    emails_opened INT DEFAULT 0,
    emails_clicked INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(funnel_id, phase_order)
);

-- Enrollments - tracks leads/contacts in funnels
CREATE TABLE email_funnel_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    funnel_id UUID NOT NULL REFERENCES email_funnels(id) ON DELETE CASCADE,

    -- Can be either a lead or a contact
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,

    status enrollment_status DEFAULT 'active',
    current_phase INT DEFAULT 1,  -- Which phase they're currently at

    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    enrolled_by UUID REFERENCES users(id),

    -- Tracking
    last_email_sent_at TIMESTAMPTZ,
    next_email_scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Either lead_id or contact_id must be set
    CONSTRAINT enrollment_has_recipient CHECK (
        (lead_id IS NOT NULL AND contact_id IS NULL) OR
        (lead_id IS NULL AND contact_id IS NOT NULL)
    ),
    -- Prevent duplicate enrollments
    UNIQUE(funnel_id, lead_id),
    UNIQUE(funnel_id, contact_id)
);

-- Email logs for funnel emails
CREATE TABLE email_funnel_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enrollment_id UUID NOT NULL REFERENCES email_funnel_enrollments(id) ON DELETE CASCADE,
    phase_id UUID NOT NULL REFERENCES email_funnel_phases(id) ON DELETE CASCADE,

    -- Email tracking
    email_id UUID REFERENCES emails(id),  -- Link to actual sent email if applicable
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,

    -- For scheduling
    scheduled_for TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, sent, failed, skipped
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_email_funnels_status ON email_funnels(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_funnels_created_by ON email_funnels(created_by) WHERE is_deleted = FALSE;

CREATE INDEX idx_funnel_phases_funnel ON email_funnel_phases(funnel_id);
CREATE INDEX idx_funnel_phases_template ON email_funnel_phases(template_id);

CREATE INDEX idx_funnel_enrollments_funnel ON email_funnel_enrollments(funnel_id);
CREATE INDEX idx_funnel_enrollments_lead ON email_funnel_enrollments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_funnel_enrollments_contact ON email_funnel_enrollments(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_funnel_enrollments_status ON email_funnel_enrollments(status);
CREATE INDEX idx_funnel_enrollments_next_email ON email_funnel_enrollments(next_email_scheduled_at) WHERE status = 'active';

CREATE INDEX idx_funnel_logs_enrollment ON email_funnel_logs(enrollment_id);
CREATE INDEX idx_funnel_logs_phase ON email_funnel_logs(phase_id);
CREATE INDEX idx_funnel_logs_scheduled ON email_funnel_logs(scheduled_for) WHERE status = 'pending';

-- RLS Policies
ALTER TABLE email_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_funnel_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_funnel_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_funnel_logs ENABLE ROW LEVEL SECURITY;

-- Funnels policies
CREATE POLICY "Users can view non-deleted funnels"
    ON email_funnels FOR SELECT
    TO authenticated
    USING (is_deleted = FALSE);

CREATE POLICY "Users can create funnels"
    ON email_funnels FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Users can update funnels"
    ON email_funnels FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can delete funnels"
    ON email_funnels FOR DELETE
    TO authenticated
    USING (true);

-- Phases policies
CREATE POLICY "Users can view funnel phases"
    ON email_funnel_phases FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can manage funnel phases"
    ON email_funnel_phases FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Enrollments policies
CREATE POLICY "Users can view enrollments"
    ON email_funnel_enrollments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can manage enrollments"
    ON email_funnel_enrollments FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Logs policies
CREATE POLICY "Users can view funnel logs"
    ON email_funnel_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create funnel logs"
    ON email_funnel_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Update triggers
CREATE TRIGGER update_email_funnels_updated_at
    BEFORE UPDATE ON email_funnels
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_funnel_phases_updated_at
    BEFORE UPDATE ON email_funnel_phases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_funnel_enrollments_updated_at
    BEFORE UPDATE ON email_funnel_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
