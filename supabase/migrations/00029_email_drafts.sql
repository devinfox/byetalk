-- Email Drafts table for AI-generated email drafts
-- Created when AI detects email commitment during call analysis

CREATE TABLE IF NOT EXISTS email_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  from_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  attachment_ids UUID[] DEFAULT '{}',
  due_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed')),
  ai_generated BOOLEAN DEFAULT true,
  commitment_quote TEXT, -- The original quote that triggered the draft
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

-- Index for fetching pending drafts for a user
CREATE INDEX idx_email_drafts_user_pending
  ON email_drafts(user_id, status)
  WHERE status = 'pending';

-- Index for looking up drafts by lead
CREATE INDEX idx_email_drafts_lead ON email_drafts(lead_id);

-- Index for looking up drafts by call
CREATE INDEX idx_email_drafts_call ON email_drafts(call_id);

-- Enable RLS
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own drafts
CREATE POLICY "Users can view own drafts"
  ON email_drafts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can insert their own drafts
CREATE POLICY "Users can insert own drafts"
  ON email_drafts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own drafts
CREATE POLICY "Users can update own drafts"
  ON email_drafts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can delete their own drafts
CREATE POLICY "Users can delete own drafts"
  ON email_drafts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for this table (for notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE email_drafts;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_email_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_drafts_updated_at
  BEFORE UPDATE ON email_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_email_drafts_updated_at();
