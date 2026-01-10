-- ============================================================================
-- GLOBAL DOCUMENTS SUPPORT
-- Allow documents to exist without being tied to a specific entity
-- ============================================================================

-- Make entity_id nullable for global documents
ALTER TABLE documents ALTER COLUMN entity_id DROP NOT NULL;

-- Set default entity_type to 'global' for new documents
ALTER TABLE documents ALTER COLUMN entity_type SET DEFAULT 'global';

-- Add is_favorite column for quick access
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- Add index for global document queries
CREATE INDEX IF NOT EXISTS idx_documents_global
    ON documents(uploaded_by, created_at DESC)
    WHERE is_deleted = FALSE AND entity_type = 'global';

-- Add index for favorites
CREATE INDEX IF NOT EXISTS idx_documents_favorites
    ON documents(uploaded_by, is_favorite)
    WHERE is_deleted = FALSE AND is_favorite = TRUE;

-- Update RLS policy to allow users to see global documents
DROP POLICY IF EXISTS documents_select ON documents;
CREATE POLICY documents_select ON documents
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            uploaded_by = get_current_user_id()
            OR is_manager_or_above()
            OR deal_id IN (
                SELECT id FROM deals WHERE owner_id = get_current_user_id()
            )
            OR (entity_type = 'global' AND uploaded_by = get_current_user_id())
        )
    );

-- Add delete policy for own documents
DROP POLICY IF EXISTS documents_delete ON documents;
CREATE POLICY documents_delete ON documents
    FOR UPDATE
    USING (
        uploaded_by = get_current_user_id()
        OR is_manager_or_above()
    );

COMMENT ON COLUMN documents.entity_type IS 'Type of entity this document belongs to. Use "global" for library documents.';
COMMENT ON COLUMN documents.is_favorite IS 'Quick access flag for frequently used documents';
