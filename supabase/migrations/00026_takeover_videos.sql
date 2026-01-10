-- Takeover Videos table for storing Runway-generated videos
-- when one employee overtakes another in rankings

CREATE TABLE IF NOT EXISTS takeover_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runway_task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  video_url TEXT,
  prompt TEXT,
  composite_filename TEXT, -- Temporary composite image filename for cleanup
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Prevent duplicate videos for the same takeover within a short time
  CONSTRAINT unique_recent_takeover UNIQUE (winner_id, loser_id, created_at)
);

-- Index for querying by status
CREATE INDEX idx_takeover_videos_status ON takeover_videos(status);

-- Index for querying by winner/loser
CREATE INDEX idx_takeover_videos_winner ON takeover_videos(winner_id);
CREATE INDEX idx_takeover_videos_loser ON takeover_videos(loser_id);

-- RLS policies
ALTER TABLE takeover_videos ENABLE ROW LEVEL SECURITY;

-- Everyone can view takeover videos (they're meant to be displayed publicly)
CREATE POLICY "Anyone can view takeover videos"
  ON takeover_videos FOR SELECT
  USING (true);

-- Only service role can insert/update (API creates these)
CREATE POLICY "Service role can insert takeover videos"
  ON takeover_videos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update takeover videos"
  ON takeover_videos FOR UPDATE
  USING (true);
