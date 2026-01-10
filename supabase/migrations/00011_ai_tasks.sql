-- ============================================================================
-- AI-GENERATED TASKS AND CALL ANALYSIS
-- ============================================================================
-- Adds support for AI-generated tasks from call transcriptions

-- Add source tracking to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';
-- source: 'manual', 'ai_call_analysis', 'automation', 'system'

-- Add call reference to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id);

-- Create index for call-related tasks
CREATE INDEX IF NOT EXISTS idx_tasks_call ON tasks(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source) WHERE is_deleted = FALSE;

-- Add AI analysis fields to calls table if not exists
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_tasks_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMPTZ;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN tasks.source IS 'Origin of the task: manual, ai_call_analysis, automation, system';
COMMENT ON COLUMN tasks.call_id IS 'Reference to call that generated this task (if AI-generated)';
COMMENT ON COLUMN calls.ai_tasks_generated IS 'Whether AI has processed this call and generated tasks';
COMMENT ON COLUMN calls.ai_processed_at IS 'When AI processing was completed';
