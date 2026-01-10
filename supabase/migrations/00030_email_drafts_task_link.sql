-- Add task_id to email_drafts to link drafts with their associated tasks
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for looking up drafts by task
CREATE INDEX IF NOT EXISTS idx_email_drafts_task ON email_drafts(task_id);
