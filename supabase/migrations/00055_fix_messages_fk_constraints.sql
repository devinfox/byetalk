-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00055: Fix Messages Foreign Key Constraints
--
-- The messages table has foreign keys pointing to 'profiles' table instead of
-- 'users' table. This migration fixes the constraints to reference the correct
-- table.
-- ============================================================================

-- First, check and drop the incorrect foreign key constraints if they exist
DO $$
BEGIN
    -- Drop sender_id FK if it references profiles
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'messages'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'profiles'
    ) THEN
        -- Drop all FKs on messages that reference profiles
        EXECUTE (
            SELECT string_agg('ALTER TABLE messages DROP CONSTRAINT IF EXISTS ' || tc.constraint_name || ';', ' ')
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.table_name = 'messages'
              AND tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_name = 'profiles'
        );

        RAISE NOTICE 'Dropped foreign key constraints referencing profiles table';
    END IF;
END $$;

-- Drop existing constraints by name (common names)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey1;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_id_fkey1;

-- Add correct foreign key constraints to users table
DO $$
BEGIN
    -- Add sender_id FK if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'messages'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
          AND kcu.column_name = 'sender_id'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT messages_sender_id_fkey
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added sender_id foreign key to users table';
    END IF;

    -- Add recipient_id FK if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'messages'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
          AND kcu.column_name = 'recipient_id'
    ) THEN
        ALTER TABLE messages
            ADD CONSTRAINT messages_recipient_id_fkey
            FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added recipient_id foreign key to users table';
    END IF;
END $$;

-- Verify the constraints are correct
DO $$
DECLARE
    fk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'messages'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'users';

    IF fk_count >= 2 THEN
        RAISE NOTICE 'SUCCESS: Messages table now has % foreign keys to users table', fk_count;
    ELSE
        RAISE WARNING 'WARNING: Expected 2 FKs to users, found %', fk_count;
    END IF;
END $$;
