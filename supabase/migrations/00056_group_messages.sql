-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00056: Group Messages Support for ByeMessage
-- ============================================================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MESSAGE GROUPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Group info
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,

    -- Organization scope
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Creator
    created_by UUID NOT NULL REFERENCES users(id),

    -- Settings
    is_private BOOLEAN DEFAULT FALSE,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    group_id UUID NOT NULL REFERENCES message_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Role in group
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),

    -- Notification settings
    is_muted BOOLEAN DEFAULT FALSE,

    -- Timestamps
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(group_id, user_id)
);

-- ============================================================================
-- GROUP MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Group reference
    group_id UUID NOT NULL REFERENCES message_groups(id) ON DELETE CASCADE,

    -- Sender
    sender_id UUID NOT NULL REFERENCES users(id),

    -- Content
    content TEXT NOT NULL,

    -- Optional reply to another message
    reply_to_id UUID REFERENCES group_messages(id),

    -- Attachments (stored as JSON array)
    attachments JSONB DEFAULT '[]',

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROUP MESSAGE READ STATUS
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    group_id UUID NOT NULL REFERENCES message_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Last read message
    last_read_message_id UUID REFERENCES group_messages(id),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(group_id, user_id)
);

-- ============================================================================
-- ADD ORGANIZATION_ID TO MESSAGES (for better querying)
-- ============================================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_message_groups_org ON message_groups(organization_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_message_group_members_user ON message_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_message_group_members_group ON message_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_group_messages_sender ON group_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_group_message_reads_user ON group_message_reads(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE message_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_message_reads ENABLE ROW LEVEL SECURITY;

-- Message Groups: Users can see groups they're members of
CREATE POLICY message_groups_select ON message_groups
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND EXISTS (
            SELECT 1 FROM message_group_members
            WHERE group_id = message_groups.id
              AND user_id = get_current_user_id()
        )
    );

-- Message Groups: Users can create groups in their org
CREATE POLICY message_groups_insert ON message_groups
    FOR INSERT
    WITH CHECK (
        created_by = get_current_user_id()
        AND organization_id = get_current_organization_id()
    );

-- Message Groups: Only admins can update
CREATE POLICY message_groups_update ON message_groups
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM message_group_members
            WHERE group_id = message_groups.id
              AND user_id = get_current_user_id()
              AND role = 'admin'
        )
    );

-- Group Members: Users can see members of groups they belong to
CREATE POLICY group_members_select ON message_group_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM message_group_members mgm
            WHERE mgm.group_id = message_group_members.group_id
              AND mgm.user_id = get_current_user_id()
        )
    );

-- Group Members: Group admins can add members
CREATE POLICY group_members_insert ON message_group_members
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM message_group_members
            WHERE group_id = message_group_members.group_id
              AND user_id = get_current_user_id()
              AND role = 'admin'
        )
        OR (
            -- Creator adding themselves as first admin
            user_id = get_current_user_id()
            AND NOT EXISTS (
                SELECT 1 FROM message_group_members
                WHERE group_id = message_group_members.group_id
            )
        )
    );

-- Group Members: Admins can remove members, users can remove themselves
CREATE POLICY group_members_delete ON message_group_members
    FOR DELETE
    USING (
        user_id = get_current_user_id()
        OR EXISTS (
            SELECT 1 FROM message_group_members
            WHERE group_id = message_group_members.group_id
              AND user_id = get_current_user_id()
              AND role = 'admin'
        )
    );

-- Group Messages: Users can see messages in groups they belong to
CREATE POLICY group_messages_select ON group_messages
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND EXISTS (
            SELECT 1 FROM message_group_members
            WHERE group_id = group_messages.group_id
              AND user_id = get_current_user_id()
        )
    );

-- Group Messages: Members can send messages
CREATE POLICY group_messages_insert ON group_messages
    FOR INSERT
    WITH CHECK (
        sender_id = get_current_user_id()
        AND EXISTS (
            SELECT 1 FROM message_group_members
            WHERE group_id = group_messages.group_id
              AND user_id = get_current_user_id()
        )
    );

-- Group Messages: Senders can delete their own messages
CREATE POLICY group_messages_update ON group_messages
    FOR UPDATE
    USING (sender_id = get_current_user_id());

-- Read Status: Users can manage their own read status
CREATE POLICY group_reads_all ON group_message_reads
    FOR ALL
    USING (user_id = get_current_user_id())
    WITH CHECK (user_id = get_current_user_id());

-- ============================================================================
-- REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_group_members;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE message_groups IS 'Group chat channels for team communication';
COMMENT ON TABLE message_group_members IS 'Members of group chats';
COMMENT ON TABLE group_messages IS 'Messages within group chats';
COMMENT ON TABLE group_message_reads IS 'Tracks last read message per user per group';
