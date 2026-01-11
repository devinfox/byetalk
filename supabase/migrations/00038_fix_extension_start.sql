-- Fix extension starting number (start from 0 instead of 100)
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
