-- ============================================================================
-- BYETALK CRM - Database Schema
-- Migration 00044: Make meeting_id nullable in meeting_recordings
-- ============================================================================

-- Allow recordings to exist without a linked meeting
-- This is useful for syncing ALL recordings from Daily.co,
-- including ones from rooms that weren't created through our app

ALTER TABLE meeting_recordings
    ALTER COLUMN meeting_id DROP NOT NULL;

-- Update RLS policy to allow viewing orphaned recordings
DROP POLICY IF EXISTS recordings_select ON meeting_recordings;

CREATE POLICY recordings_select ON meeting_recordings
    FOR SELECT
    USING (
        -- Recordings linked to meetings follow normal access rules
        (
            meeting_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM meetings m
                WHERE m.id = meeting_recordings.meeting_id
                AND m.is_deleted = FALSE
                AND (
                    m.host_id = get_current_user_id()
                    OR m.organization_id = get_current_organization_id()
                    OR m.id IN (SELECT meeting_id FROM meeting_participants WHERE user_id = get_current_user_id())
                )
            )
        )
        -- Orphaned recordings (no meeting_id) are visible to all authenticated users
        -- In a multi-tenant system, you might want to add organization filtering here
        OR (meeting_id IS NULL AND auth.uid() IS NOT NULL)
    );

-- Update insert policy to allow orphaned recordings
DROP POLICY IF EXISTS recordings_insert ON meeting_recordings;

CREATE POLICY recordings_insert ON meeting_recordings
    FOR INSERT
    WITH CHECK (
        -- Allow insert for linked meetings
        (
            meeting_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM meetings m
                WHERE m.id = meeting_recordings.meeting_id
                AND (
                    m.host_id = get_current_user_id()
                    OR m.organization_id = get_current_organization_id()
                )
            )
        )
        -- Allow insert for orphaned recordings (admin/sync operations)
        OR meeting_id IS NULL
    );

-- Add index for finding orphaned recordings
CREATE INDEX IF NOT EXISTS idx_recordings_orphaned ON meeting_recordings(id) WHERE meeting_id IS NULL;
