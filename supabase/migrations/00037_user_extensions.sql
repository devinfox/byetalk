-- ============================================================================
-- BYETALK CRM - User Extensions
-- Migration 00037: Add extension support for users
-- ============================================================================

-- Add extension column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS extension INTEGER;

-- Unique constraint on extension per organization (only for non-null, non-deleted)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_extension_org
ON users(organization_id, extension)
WHERE extension IS NOT NULL AND is_deleted = FALSE;

-- Function to get the next available extension for an organization
CREATE OR REPLACE FUNCTION get_next_extension(p_organization_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    next_ext INTEGER;
BEGIN
    SELECT COALESCE(MAX(extension), 0) + 1
    INTO next_ext
    FROM users
    WHERE organization_id = p_organization_id
      AND extension IS NOT NULL
      AND is_deleted = FALSE;

    RETURN next_ext;
END;
$$;

-- Function to auto-assign extension to a user
CREATE OR REPLACE FUNCTION assign_user_extension(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_org_id UUID;
    v_current_ext INTEGER;
    v_new_ext INTEGER;
BEGIN
    -- Get user's organization and current extension
    SELECT organization_id, extension
    INTO v_org_id, v_current_ext
    FROM users
    WHERE id = p_user_id;

    -- If already has extension, return it
    IF v_current_ext IS NOT NULL THEN
        RETURN v_current_ext;
    END IF;

    -- Get next available extension
    v_new_ext := get_next_extension(v_org_id);

    -- Assign it to the user
    UPDATE users
    SET extension = v_new_ext,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN v_new_ext;
END;
$$;

COMMENT ON COLUMN users.extension IS 'Phone extension number for direct dialing (e.g., 101, 102)';
