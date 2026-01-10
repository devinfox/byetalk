-- Add timezone column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';

-- Comment
COMMENT ON COLUMN users.timezone IS 'User preferred timezone for displaying dates/times';
