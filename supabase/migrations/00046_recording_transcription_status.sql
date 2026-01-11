-- ============================================================================
-- BYETALK CRM - Database Schema
-- Migration 00046: Add transcription_status to meeting_recordings
-- ============================================================================

-- Add transcription_status column to track automatic transcription progress
ALTER TABLE meeting_recordings
    ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20) DEFAULT NULL;

-- Add thumbnail_url for video preview cards
ALTER TABLE meeting_recordings
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;

-- Create index for filtering by transcription status
CREATE INDEX IF NOT EXISTS idx_recordings_transcription_status
    ON meeting_recordings(transcription_status)
    WHERE transcription_status IS NOT NULL;

-- Comment
COMMENT ON COLUMN meeting_recordings.transcription_status IS 'Status of automatic transcription: pending, processing, completed, failed';
COMMENT ON COLUMN meeting_recordings.thumbnail_url IS 'URL to video thumbnail for preview cards';
