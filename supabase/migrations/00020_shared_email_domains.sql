-- Add is_shared column to email_domains for universal/company-wide domains
ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;

-- Mark bookaestheticala.com as a shared domain
UPDATE email_domains SET is_shared = TRUE WHERE domain = 'bookaestheticala.com';

-- Update RLS policy to allow all authenticated users to view shared domains
DROP POLICY IF EXISTS "Users can view their own domains" ON email_domains;
CREATE POLICY "Users can view their own or shared domains" ON email_domains
  FOR SELECT USING (
    created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
    OR is_shared = TRUE
  );

-- Update RLS policy for email_accounts to allow creating accounts on shared domains
DROP POLICY IF EXISTS "Users can view their own email accounts" ON email_accounts;
CREATE POLICY "Users can view their own email accounts" ON email_accounts
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Allow users to insert accounts on shared domains or their own domains
DROP POLICY IF EXISTS "Users can create email accounts" ON email_accounts;
CREATE POLICY "Users can create email accounts on own or shared domains" ON email_accounts
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    AND (
      domain_id IN (SELECT id FROM email_domains WHERE created_by IN (SELECT id FROM users WHERE auth_id = auth.uid()))
      OR domain_id IN (SELECT id FROM email_domains WHERE is_shared = TRUE)
    )
  );
