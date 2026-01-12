-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00053: Fix Messages Insert RLS Policy
--
-- The previous policy required organization_id matching which fails when NULL.
-- This fix allows messages between users in the same organization OR when
-- organization_id is not set (for backwards compatibility).
-- ============================================================================

-- Drop and recreate the insert policy with proper NULL handling
DROP POLICY IF EXISTS messages_org_insert ON messages;

CREATE POLICY messages_org_insert ON messages
    FOR INSERT
    WITH CHECK (
        -- Sender must be the current user
        sender_id = get_current_user_id()
        -- Recipient must be in the same organization (or both have no org)
        AND (
            -- Both users have no organization (legacy/unassigned)
            (get_current_organization_id() IS NULL)
            OR
            -- Both users are in the same organization
            EXISTS (
                SELECT 1 FROM users
                WHERE id = recipient_id
                  AND is_deleted = FALSE
                  AND (
                      organization_id = get_current_organization_id()
                      OR (organization_id IS NULL AND get_current_organization_id() IS NULL)
                  )
            )
        )
    );

COMMENT ON POLICY messages_org_insert ON messages IS 'Users can send messages to other users in their organization';
