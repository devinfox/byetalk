-- ============================================================================
-- Fix infinite recursion in meetings RLS policies
-- ============================================================================

-- Drop problematic policies
DROP POLICY IF EXISTS meetings_select ON meetings;
DROP POLICY IF EXISTS participants_select ON meeting_participants;
DROP POLICY IF EXISTS recordings_select ON meeting_recordings;
DROP POLICY IF EXISTS chat_select ON meeting_chat_messages;

-- Create a SECURITY DEFINER function to check participant access without triggering RLS
CREATE OR REPLACE FUNCTION is_meeting_participant(p_meeting_id UUID, p_user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM meeting_participants
        WHERE meeting_id = p_meeting_id AND user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- Create a function to get meeting info without RLS
CREATE OR REPLACE FUNCTION get_meeting_host_and_org(p_meeting_id UUID)
RETURNS TABLE(host_id UUID, organization_id UUID, is_deleted BOOLEAN)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT m.host_id, m.organization_id, m.is_deleted
    FROM meetings m
    WHERE m.id = p_meeting_id;
END;
$$ LANGUAGE plpgsql;

-- Meetings: Fixed policy without circular reference
CREATE POLICY meetings_select ON meetings
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            host_id = get_current_user_id()
            OR organization_id = get_current_organization_id()
            OR is_meeting_participant(id, get_current_user_id())
            OR is_manager_or_above()
        )
    );

-- Participants: Use SECURITY DEFINER function to check meeting access
CREATE POLICY participants_select ON meeting_participants
    FOR SELECT
    USING (
        user_id = get_current_user_id()
        OR EXISTS (
            SELECT 1 FROM get_meeting_host_and_org(meeting_participants.meeting_id) m
            WHERE m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
    );

-- Recordings: Use SECURITY DEFINER function
CREATE POLICY recordings_select ON meeting_recordings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM get_meeting_host_and_org(meeting_recordings.meeting_id) m
            WHERE m.is_deleted = FALSE
            AND (
                m.host_id = get_current_user_id()
                OR m.organization_id = get_current_organization_id()
            )
        )
        OR is_meeting_participant(meeting_recordings.meeting_id, get_current_user_id())
    );

-- Chat: Use SECURITY DEFINER function
CREATE POLICY chat_select ON meeting_chat_messages
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            EXISTS (
                SELECT 1 FROM get_meeting_host_and_org(meeting_chat_messages.meeting_id) m
                WHERE m.is_deleted = FALSE
                AND (
                    m.host_id = get_current_user_id()
                    OR m.organization_id = get_current_organization_id()
                )
            )
            OR is_meeting_participant(meeting_chat_messages.meeting_id, get_current_user_id())
        )
    );
