-- Fix invoices RLS policies
-- The original policy checked created_by = auth.uid() but created_by stores the CRM user ID,
-- not the Supabase Auth ID. We need to check against the users table instead.

-- Drop existing policies
DROP POLICY IF EXISTS invoices_select_policy ON invoices;
DROP POLICY IF EXISTS invoices_insert_policy ON invoices;
DROP POLICY IF EXISTS invoices_update_policy ON invoices;
DROP POLICY IF EXISTS invoices_delete_policy ON invoices;

-- Recreate policies with correct checks

-- Policy: Users can view their own invoices, admin can view all
CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT
  USING (
    created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_id = auth.uid()
      AND users.email = 'admin@citadelgold.com'
    )
  );

-- Policy: Users can insert invoices linked to their CRM user ID
CREATE POLICY invoices_insert_policy ON invoices
  FOR INSERT
  WITH CHECK (
    created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Policy: Users can update their own invoices
CREATE POLICY invoices_update_policy ON invoices
  FOR UPDATE
  USING (
    created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Policy: Users can delete their own invoices
CREATE POLICY invoices_delete_policy ON invoices
  FOR DELETE
  USING (
    created_by IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Add name column for naming invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS name TEXT;
