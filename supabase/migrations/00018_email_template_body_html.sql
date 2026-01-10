-- Add body_html column for generated HTML (from block-based content)
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS body_html TEXT;

-- Note: Create storage bucket 'email-images' via Supabase Dashboard
-- with public access for email image uploads
