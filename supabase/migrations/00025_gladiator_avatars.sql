-- Add gladiator avatar field to users table
-- This stores the URL to the user's custom gladiator avatar for the scoreboard

ALTER TABLE users ADD COLUMN IF NOT EXISTS gladiator_avatar TEXT;

-- Add a comment explaining the field
COMMENT ON COLUMN users.gladiator_avatar IS 'URL to user''s custom gladiator avatar for the sales scoreboard. If null, a random default avatar is assigned.';

-- Create a storage bucket for gladiator avatars (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gladiator-avatars', 'gladiator-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own gladiator avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gladiator-avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own avatar
CREATE POLICY "Users can update their own gladiator avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'gladiator-avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete their own gladiator avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'gladiator-avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to gladiator avatars (for scoreboard display)
CREATE POLICY "Public can view gladiator avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'gladiator-avatars');
