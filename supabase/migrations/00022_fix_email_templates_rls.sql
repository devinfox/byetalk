-- Fix RLS policies for email_templates to allow soft delete
-- The UPDATE policy needs WITH CHECK to allow setting is_deleted = true

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view active email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can create email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can update email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can delete email templates" ON email_templates;

-- Recreate SELECT policy - users can view non-deleted templates
CREATE POLICY "Users can view active email templates"
    ON email_templates FOR SELECT
    TO authenticated
    USING (is_deleted = FALSE);

-- CREATE policy - users can create templates
CREATE POLICY "Users can create email templates"
    ON email_templates FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE policy - users can update any template AND set any values (including is_deleted = true)
CREATE POLICY "Users can update email templates"
    ON email_templates FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- DELETE policy (for hard deletes if ever needed)
CREATE POLICY "Users can delete email templates"
    ON email_templates FOR DELETE
    TO authenticated
    USING (true);
