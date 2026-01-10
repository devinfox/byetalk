-- Email Templates table for storing reusable email templates
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    description TEXT,
    category VARCHAR(50), -- e.g., 'welcome', 'follow_up', 'paperwork', 'closing', 'funding', 'general'
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_email_templates_active ON email_templates(is_active) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_templates_category ON email_templates(category) WHERE is_deleted = FALSE;
CREATE INDEX idx_email_templates_created_by ON email_templates(created_by) WHERE is_deleted = FALSE;

-- RLS Policies
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active templates
CREATE POLICY "Users can view active email templates"
    ON email_templates FOR SELECT
    TO authenticated
    USING (is_deleted = FALSE);

-- All authenticated users can create templates
CREATE POLICY "Users can create email templates"
    ON email_templates FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- All authenticated users can update templates
CREATE POLICY "Users can update email templates"
    ON email_templates FOR UPDATE
    TO authenticated
    USING (true);

-- All authenticated users can delete templates (soft delete)
CREATE POLICY "Users can delete email templates"
    ON email_templates FOR DELETE
    TO authenticated
    USING (true);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
