-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00014: Chat Messages for Internal Employee Communication
-- ============================================================================

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Participants
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID NOT NULL REFERENCES users(id),

    -- Content
    content TEXT NOT NULL,

    -- Read status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_different_users CHECK (sender_id != recipient_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for fetching conversation between two users (ordered by time)
CREATE INDEX idx_messages_conversation ON messages(
    LEAST(sender_id, recipient_id),
    GREATEST(sender_id, recipient_id),
    created_at DESC
) WHERE is_deleted = FALSE;

-- Index for fetching unread messages for a user
CREATE INDEX idx_messages_unread ON messages(recipient_id, is_read)
WHERE is_deleted = FALSE AND is_read = FALSE;

-- Index for sender lookup
CREATE INDEX idx_messages_sender ON messages(sender_id, created_at DESC)
WHERE is_deleted = FALSE;

-- Index for recipient lookup
CREATE INDEX idx_messages_recipient ON messages(recipient_id, created_at DESC)
WHERE is_deleted = FALSE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can only read messages where they are sender or recipient
CREATE POLICY messages_select ON messages
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            sender_id = get_current_user_id()
            OR recipient_id = get_current_user_id()
        )
    );

-- Users can only send messages as themselves
CREATE POLICY messages_insert ON messages
    FOR INSERT
    WITH CHECK (
        sender_id = get_current_user_id()
    );

-- Users can update messages they received (for read status) or sent (for delete)
CREATE POLICY messages_update ON messages
    FOR UPDATE
    USING (
        sender_id = get_current_user_id()
        OR recipient_id = get_current_user_id()
    )
    WITH CHECK (
        sender_id = get_current_user_id()
        OR recipient_id = get_current_user_id()
    );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get unread message count for current user
CREATE OR REPLACE FUNCTION get_unread_message_count()
RETURNS INTEGER AS $$
    SELECT COALESCE(COUNT(*)::INTEGER, 0)
    FROM messages
    WHERE recipient_id = get_current_user_id()
      AND is_read = FALSE
      AND is_deleted = FALSE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to get unread count per sender
CREATE OR REPLACE FUNCTION get_unread_counts_by_sender()
RETURNS TABLE(sender_id UUID, unread_count INTEGER) AS $$
    SELECT m.sender_id, COUNT(*)::INTEGER as unread_count
    FROM messages m
    WHERE m.recipient_id = get_current_user_id()
      AND m.is_read = FALSE
      AND m.is_deleted = FALSE
    GROUP BY m.sender_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- REALTIME SUBSCRIPTION SETUP
-- ============================================================================

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE messages IS 'Internal employee-to-employee chat messages';
COMMENT ON FUNCTION get_unread_message_count() IS 'Returns total unread message count for current user';
COMMENT ON FUNCTION get_unread_counts_by_sender() IS 'Returns unread counts grouped by sender for current user';
