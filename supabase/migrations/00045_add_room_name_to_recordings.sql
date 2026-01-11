-- ============================================================================
-- BYETALK CRM - Database Schema
-- Migration 00045: Add room_name to meeting_recordings
-- ============================================================================

-- Add room_name column to store the Daily.co room name
-- This is useful for identifying orphaned recordings (those without a meeting_id)
ALTER TABLE meeting_recordings
    ADD COLUMN IF NOT EXISTS room_name VARCHAR(100);

-- Create index for looking up recordings by room name
CREATE INDEX IF NOT EXISTS idx_recordings_room_name ON meeting_recordings(room_name) WHERE room_name IS NOT NULL;
