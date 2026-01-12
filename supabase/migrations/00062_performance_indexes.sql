-- Performance optimization indexes
-- These indexes speed up common queries in the lead detail page and email system

-- Email lead links - frequently queried by lead_id
CREATE INDEX IF NOT EXISTS idx_email_lead_links_lead_id ON email_lead_links(lead_id);

-- Emails - frequently queried by lead_id
CREATE INDEX IF NOT EXISTS idx_emails_lead_id ON emails(lead_id) WHERE lead_id IS NOT NULL;

-- Activity log - frequently queried by entity_type + entity_id
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- Tasks - frequently queried by entity_type + entity_id
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks(entity_type, entity_id) WHERE is_deleted = false;

-- Tasks - frequently queried by lead_id (from call processing)
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id) WHERE lead_id IS NOT NULL AND is_deleted = false;

-- Notes - frequently queried by entity_type + entity_id
CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(entity_type, entity_id) WHERE is_deleted = false;

-- Calls - frequently queried by lead_id
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id) WHERE is_deleted = false;

-- Email threads - frequently queried by email_account_id and folder
CREATE INDEX IF NOT EXISTS idx_email_threads_account_folder ON email_threads(email_account_id, folder) WHERE is_deleted = false;

-- Turbo call queue - frequently queried by organization_id and status
CREATE INDEX IF NOT EXISTS idx_turbo_call_queue_org_status ON turbo_call_queue(organization_id, status);

-- Leads - frequently queried by owner_id
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON leads(owner_id) WHERE is_deleted = false;

-- Leads - frequently queried by campaign_id
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id) WHERE is_deleted = false;
