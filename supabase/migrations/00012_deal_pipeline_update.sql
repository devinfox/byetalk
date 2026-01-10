-- Update deal pipeline stages to new simplified structure
-- New stages:
-- 1. deal_opened - Customer has 100% intent, Dollar estimate set
-- 2. proposal_education - Brochure sent, Metals/Custodian explained
-- 3. paperwork_sent - IRA/transfer paperwork delivered, AI follow-up tasks created
-- 4. paperwork_complete - Forms returned, Waiting on custodian
-- 5. funding_in_progress - Money moving, Timeline known
-- 6. closed_won - Funds received, Metals purchased, Commission eligible
-- 7. closed_lost - Did not fund, Reason captured

-- ============================================================================
-- STEP 1: Drop dependent views
-- ============================================================================
DROP VIEW IF EXISTS v_rep_performance CASCADE;
DROP VIEW IF EXISTS v_deal_pipeline CASCADE;
DROP VIEW IF EXISTS v_team_performance CASCADE;
DROP VIEW IF EXISTS v_campaign_performance CASCADE;
DROP VIEW IF EXISTS v_executive_dashboard CASCADE;
DROP VIEW IF EXISTS v_lead_source_attribution CASCADE;
DROP VIEW IF EXISTS v_time_to_close CASCADE;

-- ============================================================================
-- STEP 2: Create the new enum type
-- ============================================================================
CREATE TYPE deal_stage_new AS ENUM (
    'deal_opened',
    'proposal_education',
    'paperwork_sent',
    'paperwork_complete',
    'funding_in_progress',
    'closed_won',
    'closed_lost'
);

-- ============================================================================
-- STEP 3: Migrate deals table
-- ============================================================================
ALTER TABLE deals ADD COLUMN stage_new deal_stage_new;

UPDATE deals SET stage_new = CASE stage::text
    WHEN 'new_opportunity' THEN 'deal_opened'::deal_stage_new
    WHEN 'initial_contact' THEN 'deal_opened'::deal_stage_new
    WHEN 'discovery' THEN 'deal_opened'::deal_stage_new
    WHEN 'proposal_sent' THEN 'proposal_education'::deal_stage_new
    WHEN 'agreement_signed' THEN 'paperwork_sent'::deal_stage_new
    WHEN 'paperwork_submitted' THEN 'paperwork_sent'::deal_stage_new
    WHEN 'custodian_approved' THEN 'paperwork_complete'::deal_stage_new
    WHEN 'funding_pending' THEN 'funding_in_progress'::deal_stage_new
    WHEN 'funds_received' THEN 'closed_won'::deal_stage_new
    WHEN 'metals_purchased' THEN 'closed_won'::deal_stage_new
    WHEN 'closed_won' THEN 'closed_won'::deal_stage_new
    WHEN 'closed_lost' THEN 'closed_lost'::deal_stage_new
    ELSE 'deal_opened'::deal_stage_new
END;

ALTER TABLE deals DROP COLUMN stage;
ALTER TABLE deals RENAME COLUMN stage_new TO stage;
ALTER TABLE deals ALTER COLUMN stage SET NOT NULL;
ALTER TABLE deals ALTER COLUMN stage SET DEFAULT 'deal_opened';

-- ============================================================================
-- STEP 4: Migrate deal_stage_history table
-- ============================================================================
ALTER TABLE deal_stage_history ADD COLUMN from_stage_new deal_stage_new;
ALTER TABLE deal_stage_history ADD COLUMN to_stage_new deal_stage_new;

UPDATE deal_stage_history SET
    from_stage_new = CASE from_stage::text
        WHEN 'new_opportunity' THEN 'deal_opened'::deal_stage_new
        WHEN 'initial_contact' THEN 'deal_opened'::deal_stage_new
        WHEN 'discovery' THEN 'deal_opened'::deal_stage_new
        WHEN 'proposal_sent' THEN 'proposal_education'::deal_stage_new
        WHEN 'agreement_signed' THEN 'paperwork_sent'::deal_stage_new
        WHEN 'paperwork_submitted' THEN 'paperwork_sent'::deal_stage_new
        WHEN 'custodian_approved' THEN 'paperwork_complete'::deal_stage_new
        WHEN 'funding_pending' THEN 'funding_in_progress'::deal_stage_new
        WHEN 'funds_received' THEN 'closed_won'::deal_stage_new
        WHEN 'metals_purchased' THEN 'closed_won'::deal_stage_new
        WHEN 'closed_won' THEN 'closed_won'::deal_stage_new
        WHEN 'closed_lost' THEN 'closed_lost'::deal_stage_new
        ELSE 'deal_opened'::deal_stage_new
    END,
    to_stage_new = CASE to_stage::text
        WHEN 'new_opportunity' THEN 'deal_opened'::deal_stage_new
        WHEN 'initial_contact' THEN 'deal_opened'::deal_stage_new
        WHEN 'discovery' THEN 'deal_opened'::deal_stage_new
        WHEN 'proposal_sent' THEN 'proposal_education'::deal_stage_new
        WHEN 'agreement_signed' THEN 'paperwork_sent'::deal_stage_new
        WHEN 'paperwork_submitted' THEN 'paperwork_sent'::deal_stage_new
        WHEN 'custodian_approved' THEN 'paperwork_complete'::deal_stage_new
        WHEN 'funding_pending' THEN 'funding_in_progress'::deal_stage_new
        WHEN 'funds_received' THEN 'closed_won'::deal_stage_new
        WHEN 'metals_purchased' THEN 'closed_won'::deal_stage_new
        WHEN 'closed_won' THEN 'closed_won'::deal_stage_new
        WHEN 'closed_lost' THEN 'closed_lost'::deal_stage_new
        ELSE 'deal_opened'::deal_stage_new
    END;

ALTER TABLE deal_stage_history DROP COLUMN from_stage;
ALTER TABLE deal_stage_history DROP COLUMN to_stage;
ALTER TABLE deal_stage_history RENAME COLUMN from_stage_new TO from_stage;
ALTER TABLE deal_stage_history RENAME COLUMN to_stage_new TO to_stage;

-- ============================================================================
-- STEP 5: Migrate deal_stage_config table
-- ============================================================================
ALTER TABLE deal_stage_config ADD COLUMN stage_new deal_stage_new;

UPDATE deal_stage_config SET stage_new = CASE stage::text
    WHEN 'new_opportunity' THEN 'deal_opened'::deal_stage_new
    WHEN 'initial_contact' THEN 'deal_opened'::deal_stage_new
    WHEN 'discovery' THEN 'deal_opened'::deal_stage_new
    WHEN 'proposal_sent' THEN 'proposal_education'::deal_stage_new
    WHEN 'agreement_signed' THEN 'paperwork_sent'::deal_stage_new
    WHEN 'paperwork_submitted' THEN 'paperwork_sent'::deal_stage_new
    WHEN 'custodian_approved' THEN 'paperwork_complete'::deal_stage_new
    WHEN 'funding_pending' THEN 'funding_in_progress'::deal_stage_new
    WHEN 'funds_received' THEN 'closed_won'::deal_stage_new
    WHEN 'metals_purchased' THEN 'closed_won'::deal_stage_new
    WHEN 'closed_won' THEN 'closed_won'::deal_stage_new
    WHEN 'closed_lost' THEN 'closed_lost'::deal_stage_new
    ELSE 'deal_opened'::deal_stage_new
END;

-- Remove duplicate stage configs (keep one per stage_new using ctid)
DELETE FROM deal_stage_config a
USING deal_stage_config b
WHERE a.ctid > b.ctid
  AND a.stage_new = b.stage_new;

ALTER TABLE deal_stage_config DROP CONSTRAINT IF EXISTS deal_stage_config_stage_key;
ALTER TABLE deal_stage_config DROP COLUMN stage;
ALTER TABLE deal_stage_config RENAME COLUMN stage_new TO stage;
ALTER TABLE deal_stage_config ALTER COLUMN stage SET NOT NULL;
ALTER TABLE deal_stage_config ADD CONSTRAINT deal_stage_config_stage_key UNIQUE (stage);

-- ============================================================================
-- STEP 6: Migrate turnovers table (has deal_stage_at_turnover column)
-- ============================================================================
ALTER TABLE turnovers ADD COLUMN deal_stage_at_turnover_new deal_stage_new;

UPDATE turnovers SET deal_stage_at_turnover_new = CASE deal_stage_at_turnover::text
    WHEN 'new_opportunity' THEN 'deal_opened'::deal_stage_new
    WHEN 'initial_contact' THEN 'deal_opened'::deal_stage_new
    WHEN 'discovery' THEN 'deal_opened'::deal_stage_new
    WHEN 'proposal_sent' THEN 'proposal_education'::deal_stage_new
    WHEN 'agreement_signed' THEN 'paperwork_sent'::deal_stage_new
    WHEN 'paperwork_submitted' THEN 'paperwork_sent'::deal_stage_new
    WHEN 'custodian_approved' THEN 'paperwork_complete'::deal_stage_new
    WHEN 'funding_pending' THEN 'funding_in_progress'::deal_stage_new
    WHEN 'funds_received' THEN 'closed_won'::deal_stage_new
    WHEN 'metals_purchased' THEN 'closed_won'::deal_stage_new
    WHEN 'closed_won' THEN 'closed_won'::deal_stage_new
    WHEN 'closed_lost' THEN 'closed_lost'::deal_stage_new
    ELSE NULL
END WHERE deal_stage_at_turnover IS NOT NULL;

ALTER TABLE turnovers DROP COLUMN deal_stage_at_turnover;
ALTER TABLE turnovers RENAME COLUMN deal_stage_at_turnover_new TO deal_stage_at_turnover;

-- ============================================================================
-- STEP 7: Drop old enum and rename new one
-- ============================================================================
DROP TYPE deal_stage;
ALTER TYPE deal_stage_new RENAME TO deal_stage;

-- ============================================================================
-- STEP 8: Update stage configs with new descriptions
-- ============================================================================
UPDATE deal_stage_config SET
    display_name = 'Deal Opened',
    description = 'Customer has 100% intent. Dollar estimate set. Deal is officially created.',
    display_order = 1,
    probability = 20.00,
    is_won_stage = FALSE,
    is_lost_stage = FALSE,
    expected_days_in_stage = 3
WHERE stage = 'deal_opened';

UPDATE deal_stage_config SET
    display_name = 'Proposal / Education',
    description = 'Brochure sent. Metals options explained. Custodian explained. Questions being answered.',
    display_order = 2,
    probability = 35.00,
    is_won_stage = FALSE,
    is_lost_stage = FALSE,
    expected_days_in_stage = 5
WHERE stage = 'proposal_education';

UPDATE deal_stage_config SET
    display_name = 'Paperwork Sent',
    description = 'IRA / transfer paperwork delivered. Follow-up tasks auto-created by AI.',
    display_order = 3,
    probability = 50.00,
    is_won_stage = FALSE,
    is_lost_stage = FALSE,
    expected_days_in_stage = 7
WHERE stage = 'paperwork_sent';

UPDATE deal_stage_config SET
    display_name = 'Paperwork Complete',
    description = 'Forms returned. Waiting on custodian / transfer processing.',
    display_order = 4,
    probability = 70.00,
    is_won_stage = FALSE,
    is_lost_stage = FALSE,
    expected_days_in_stage = 10
WHERE stage = 'paperwork_complete';

UPDATE deal_stage_config SET
    display_name = 'Funding In Progress',
    description = 'Money moving. Timeline known. Deal is very likely to close.',
    display_order = 5,
    probability = 90.00,
    is_won_stage = FALSE,
    is_lost_stage = FALSE,
    expected_days_in_stage = 14
WHERE stage = 'funding_in_progress';

UPDATE deal_stage_config SET
    display_name = 'Closed - Won',
    description = 'Funds received. Metals purchased. Commission eligible.',
    display_order = 6,
    probability = 100.00,
    is_won_stage = TRUE,
    is_lost_stage = FALSE,
    expected_days_in_stage = NULL
WHERE stage = 'closed_won';

UPDATE deal_stage_config SET
    display_name = 'Closed - Lost',
    description = 'Did not fund. Reason captured (AI-assisted).',
    display_order = 7,
    probability = 0.00,
    is_won_stage = FALSE,
    is_lost_stage = TRUE,
    expected_days_in_stage = NULL
WHERE stage = 'closed_lost';

-- Insert any missing stage configs
INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'deal_opened', 'Deal Opened', 'Customer has 100% intent. Dollar estimate set. Deal is officially created.', 1, 20.00, FALSE, FALSE, 3
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'deal_opened');

INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'proposal_education', 'Proposal / Education', 'Brochure sent. Metals options explained. Custodian explained. Questions being answered.', 2, 35.00, FALSE, FALSE, 5
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'proposal_education');

INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'paperwork_sent', 'Paperwork Sent', 'IRA / transfer paperwork delivered. Follow-up tasks auto-created by AI.', 3, 50.00, FALSE, FALSE, 7
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'paperwork_sent');

INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'paperwork_complete', 'Paperwork Complete', 'Forms returned. Waiting on custodian / transfer processing.', 4, 70.00, FALSE, FALSE, 10
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'paperwork_complete');

INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'funding_in_progress', 'Funding In Progress', 'Money moving. Timeline known. Deal is very likely to close.', 5, 90.00, FALSE, FALSE, 14
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'funding_in_progress');

INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'closed_won', 'Closed - Won', 'Funds received. Metals purchased. Commission eligible.', 6, 100.00, TRUE, FALSE, NULL
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'closed_won');

INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
SELECT 'closed_lost', 'Closed - Lost', 'Did not fund. Reason captured (AI-assisted).', 7, 0.00, FALSE, TRUE, NULL
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_config WHERE stage = 'closed_lost');

-- ============================================================================
-- STEP 9: Recreate the views with new stage values
-- ============================================================================

-- REP PERFORMANCE VIEW
CREATE OR REPLACE VIEW v_rep_performance AS
WITH date_ranges AS (
    SELECT
        CURRENT_DATE AS today,
        DATE_TRUNC('week', CURRENT_DATE)::DATE AS week_start,
        DATE_TRUNC('month', CURRENT_DATE)::DATE AS month_start,
        DATE_TRUNC('quarter', CURRENT_DATE)::DATE AS quarter_start,
        DATE_TRUNC('year', CURRENT_DATE)::DATE AS year_start
),
rep_deals AS (
    SELECT
        d.owner_id,
        d.id AS deal_id,
        d.stage,
        d.funded_amount,
        d.gross_revenue,
        d.estimated_value,
        d.created_at,
        d.closed_at,
        d.funds_received_at,
        CASE WHEN d.stage = 'closed_won' THEN 1 ELSE 0 END AS is_won,
        CASE WHEN d.stage = 'closed_lost' THEN 1 ELSE 0 END AS is_lost,
        CASE WHEN d.funds_received_at IS NOT NULL THEN 1 ELSE 0 END AS is_funded
    FROM deals d
    WHERE d.is_deleted = FALSE
),
rep_calls AS (
    SELECT
        c.user_id,
        c.id AS call_id,
        c.duration_seconds,
        c.disposition,
        c.started_at
    FROM calls c
    WHERE c.is_deleted = FALSE
      AND c.user_id IS NOT NULL
),
rep_leads AS (
    SELECT
        l.owner_id,
        l.id AS lead_id,
        l.status,
        l.created_at,
        CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END AS is_converted
    FROM leads l
    WHERE l.is_deleted = FALSE
)
SELECT
    u.id AS user_id,
    u.first_name,
    u.last_name,
    u.email,
    u.role,
    u.team_id,
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.today), 0) AS today_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.today), 0) AS today_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.today) AS today_deals_funded,
    COUNT(rd.deal_id) FILTER (WHERE rd.created_at >= dr.today) AS today_deals_created,
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.week_start), 0) AS week_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.week_start), 0) AS week_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.week_start) AS week_deals_funded,
    COUNT(rd.deal_id) FILTER (WHERE rd.created_at >= dr.week_start) AS week_deals_created,
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) AS month_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) AS month_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.month_start) AS month_deals_funded,
    COUNT(rd.deal_id) FILTER (WHERE rd.created_at >= dr.month_start) AS month_deals_created,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1 AND rd.closed_at >= dr.month_start) AS month_deals_won,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1 AND rd.closed_at >= dr.month_start) AS month_deals_lost,
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.quarter_start), 0) AS quarter_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.quarter_start), 0) AS quarter_revenue,
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.year_start), 0) AS year_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.year_start), 0) AS year_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.year_start) AS year_deals_funded,
    COALESCE(SUM(rd.funded_amount), 0) AS total_funded,
    COALESCE(SUM(rd.gross_revenue), 0) AS total_revenue,
    COUNT(rd.deal_id) AS total_deals,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1) AS total_deals_won,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1) AS total_deals_lost,
    COALESCE(AVG(rd.funded_amount) FILTER (WHERE rd.funded_amount > 0), 0) AS avg_deal_size,
    CASE
        WHEN (COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1) + COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1)) > 0
        THEN ROUND(
            COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1)::DECIMAL /
            (COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1) + COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1)) * 100
        , 2)
        ELSE 0
    END AS close_rate_percent,
    COUNT(rc.call_id) FILTER (WHERE rc.started_at >= dr.month_start) AS month_calls,
    COALESCE(SUM(rc.duration_seconds) FILTER (WHERE rc.started_at >= dr.month_start), 0) AS month_talk_time_seconds,
    COUNT(rc.call_id) FILTER (WHERE rc.disposition = 'answered' AND rc.started_at >= dr.month_start) AS month_calls_answered,
    COUNT(rl.lead_id) FILTER (WHERE rl.created_at >= dr.month_start) AS month_leads_assigned,
    COUNT(rl.lead_id) FILTER (WHERE rl.is_converted = 1 AND rl.created_at >= dr.month_start) AS month_leads_converted,
    CASE
        WHEN COUNT(rc.call_id) FILTER (WHERE rc.started_at >= dr.month_start) > 0
        THEN ROUND(
            COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) /
            COUNT(rc.call_id) FILTER (WHERE rc.started_at >= dr.month_start)
        , 2)
        ELSE 0
    END AS month_revenue_per_call,
    CASE
        WHEN COUNT(rl.lead_id) FILTER (WHERE rl.created_at >= dr.month_start) > 0
        THEN ROUND(
            COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) /
            COUNT(rl.lead_id) FILTER (WHERE rl.created_at >= dr.month_start)
        , 2)
        ELSE 0
    END AS month_revenue_per_lead
FROM users u
CROSS JOIN date_ranges dr
LEFT JOIN rep_deals rd ON rd.owner_id = u.id
LEFT JOIN rep_calls rc ON rc.user_id = u.id
LEFT JOIN rep_leads rl ON rl.owner_id = u.id
WHERE u.is_deleted = FALSE
  AND u.is_active = TRUE
  AND u.role IN ('sales_rep', 'senior_rep', 'closer')
GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.team_id,
         dr.today, dr.week_start, dr.month_start, dr.quarter_start, dr.year_start;

-- DEAL PIPELINE VIEW
CREATE OR REPLACE VIEW v_deal_pipeline AS
SELECT
    dsc.stage,
    dsc.display_name AS stage_name,
    dsc.display_order,
    dsc.probability,
    COUNT(d.id) AS deal_count,
    COALESCE(SUM(d.estimated_value), 0) AS total_estimated_value,
    COALESCE(SUM(d.funded_amount), 0) AS total_funded_amount,
    COALESCE(SUM(d.estimated_value * (dsc.probability / 100)), 0) AS weighted_value,
    COALESCE(AVG(d.estimated_value), 0) AS avg_deal_value,
    AVG(EXTRACT(EPOCH FROM (NOW() - d.stage_entered_at)) / 86400)::INTEGER AS avg_days_in_stage
FROM deal_stage_config dsc
LEFT JOIN deals d ON d.stage = dsc.stage AND d.is_deleted = FALSE
WHERE dsc.is_active = TRUE
  AND NOT dsc.is_won_stage
  AND NOT dsc.is_lost_stage
GROUP BY dsc.stage, dsc.display_name, dsc.display_order, dsc.probability
ORDER BY dsc.display_order;

-- TEAM PERFORMANCE VIEW
CREATE OR REPLACE VIEW v_team_performance AS
WITH date_ranges AS (
    SELECT
        DATE_TRUNC('month', CURRENT_DATE)::DATE AS month_start,
        DATE_TRUNC('quarter', CURRENT_DATE)::DATE AS quarter_start,
        DATE_TRUNC('year', CURRENT_DATE)::DATE AS year_start
)
SELECT
    t.id AS team_id,
    t.name AS team_name,
    COUNT(DISTINCT u.id) AS rep_count,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_revenue,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won' AND d.closed_at >= dr.month_start) AS month_deals_won,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_revenue,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_revenue,
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,
    CASE
        WHEN COUNT(DISTINCT u.id) > 0
        THEN ROUND(
            COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) /
            COUNT(DISTINCT u.id)
        , 2)
        ELSE 0
    END AS month_revenue_per_rep
FROM teams t
CROSS JOIN date_ranges dr
LEFT JOIN users u ON u.team_id = t.id AND u.is_deleted = FALSE AND u.is_active = TRUE
LEFT JOIN deals d ON d.owner_id = u.id AND d.is_deleted = FALSE
WHERE t.is_deleted = FALSE
GROUP BY t.id, t.name, dr.month_start, dr.quarter_start, dr.year_start
ORDER BY month_revenue DESC;

-- CAMPAIGN PERFORMANCE VIEW
CREATE OR REPLACE VIEW v_campaign_performance AS
WITH date_ranges AS (
    SELECT DATE_TRUNC('month', CURRENT_DATE)::DATE AS month_start
)
SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    c.code AS campaign_code,
    c.source_type,
    COUNT(DISTINCT l.id) AS total_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= dr.month_start) AS month_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') AS converted_leads,
    CASE
        WHEN COUNT(DISTINCT l.id) > 0
        THEN ROUND(COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted')::DECIMAL / COUNT(DISTINCT l.id) * 100, 2)
        ELSE 0
    END AS conversion_rate_percent,
    COUNT(DISTINCT d.id) AS total_deals,
    COUNT(DISTINCT d.id) FILTER (WHERE d.stage = 'closed_won') AS deals_won,
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,
    COUNT(DISTINCT calls.id) AS total_calls,
    COALESCE(SUM(calls.duration_seconds), 0) AS total_talk_time_seconds,
    COUNT(DISTINCT fs.id) AS total_form_submissions,
    c.budget_amount,
    c.cost_per_lead AS configured_cpl,
    CASE
        WHEN COUNT(DISTINCT l.id) > 0 AND c.budget_amount IS NOT NULL
        THEN ROUND(c.budget_amount / COUNT(DISTINCT l.id), 2)
        ELSE NULL
    END AS actual_cpl,
    CASE
        WHEN c.budget_amount IS NOT NULL AND c.budget_amount > 0
        THEN ROUND((COALESCE(SUM(d.gross_revenue), 0) - c.budget_amount) / c.budget_amount * 100, 2)
        ELSE NULL
    END AS roi_percent
FROM campaigns c
CROSS JOIN date_ranges dr
LEFT JOIN leads l ON l.campaign_id = c.id AND l.is_deleted = FALSE
LEFT JOIN deals d ON d.campaign_id = c.id AND d.is_deleted = FALSE
LEFT JOIN calls ON calls.campaign_id = c.id AND calls.is_deleted = FALSE
LEFT JOIN form_submissions fs ON fs.campaign_id = c.id AND fs.is_deleted = FALSE
WHERE c.is_deleted = FALSE
GROUP BY c.id, c.name, c.code, c.source_type, c.budget_amount, c.cost_per_lead, dr.month_start
ORDER BY total_revenue DESC;

-- EXECUTIVE DASHBOARD VIEW
CREATE OR REPLACE VIEW v_executive_dashboard AS
WITH date_ranges AS (
    SELECT
        CURRENT_DATE AS today,
        DATE_TRUNC('week', CURRENT_DATE)::DATE AS week_start,
        DATE_TRUNC('month', CURRENT_DATE)::DATE AS month_start,
        DATE_TRUNC('quarter', CURRENT_DATE)::DATE AS quarter_start,
        DATE_TRUNC('year', CURRENT_DATE)::DATE AS year_start,
        (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE AS last_month_start,
        DATE_TRUNC('month', CURRENT_DATE)::DATE - INTERVAL '1 day' AS last_month_end
)
SELECT
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.today), 0) AS today_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.today), 0) AS today_revenue,
    COUNT(d.id) FILTER (WHERE d.created_at >= dr.today) AS today_deals_created,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.week_start), 0) AS week_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.week_start), 0) AS week_revenue,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_revenue,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won' AND d.closed_at >= dr.month_start) AS month_deals_won,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost' AND d.closed_at >= dr.month_start) AS month_deals_lost,
    COUNT(d.id) FILTER (WHERE d.created_at >= dr.month_start) AS month_deals_created,
    COALESCE(AVG(d.funded_amount) FILTER (WHERE d.funded_amount > 0 AND d.funds_received_at >= dr.month_start), 0) AS month_avg_deal_size,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0) AS last_month_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0) AS last_month_revenue,
    CASE
        WHEN COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0) > 0
        THEN ROUND(
            (COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) -
             COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0)) /
            COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 1) * 100
        , 2)
        ELSE 0
    END AS mom_revenue_growth_percent,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_revenue,
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_revenue,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won' AND d.closed_at >= dr.year_start) AS year_deals_won,
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,
    COUNT(d.id) AS total_deals,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won') AS total_deals_won,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost') AS total_deals_lost,
    COALESCE(AVG(d.funded_amount) FILTER (WHERE d.funded_amount > 0), 0) AS avg_deal_size,
    CASE
        WHEN (COUNT(d.id) FILTER (WHERE d.stage = 'closed_won') + COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost')) > 0
        THEN ROUND(
            COUNT(d.id) FILTER (WHERE d.stage = 'closed_won')::DECIMAL /
            (COUNT(d.id) FILTER (WHERE d.stage = 'closed_won') + COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost')) * 100
        , 2)
        ELSE 0
    END AS overall_close_rate_percent,
    COALESCE(SUM(d.estimated_value) FILTER (WHERE d.stage NOT IN ('closed_won', 'closed_lost')), 0) AS pipeline_total_value,
    COUNT(d.id) FILTER (WHERE d.stage NOT IN ('closed_won', 'closed_lost')) AS pipeline_deal_count
FROM deals d
CROSS JOIN date_ranges dr
WHERE d.is_deleted = FALSE;

-- TIME TO CLOSE VIEW
CREATE OR REPLACE VIEW v_time_to_close AS
SELECT
    dsh.to_stage,
    dsc.display_name AS stage_name,
    dsc.display_order,
    COUNT(*) AS transition_count,
    ROUND((AVG(dsh.time_in_stage_seconds / 86400.0))::NUMERIC, 1) AS avg_days_in_previous_stage,
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dsh.time_in_stage_seconds / 86400.0))::NUMERIC, 1) AS median_days_in_previous_stage,
    ROUND((MIN(dsh.time_in_stage_seconds / 86400.0))::NUMERIC, 1) AS min_days,
    ROUND((MAX(dsh.time_in_stage_seconds / 86400.0))::NUMERIC, 1) AS max_days
FROM deal_stage_history dsh
JOIN deal_stage_config dsc ON dsc.stage = dsh.to_stage
WHERE dsh.time_in_stage_seconds IS NOT NULL
  AND dsh.time_in_stage_seconds > 0
GROUP BY dsh.to_stage, dsc.display_name, dsc.display_order
ORDER BY dsc.display_order;

-- LEAD SOURCE ATTRIBUTION VIEW
CREATE OR REPLACE VIEW v_lead_source_attribution AS
SELECT
    COALESCE(l.source_type::TEXT, 'unknown') AS source_type,
    COUNT(DISTINCT l.id) AS lead_count,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') AS converted_count,
    ROUND(
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted')::DECIMAL /
        NULLIF(COUNT(DISTINCT l.id), 0) * 100
    , 2) AS conversion_rate_percent,
    COUNT(DISTINCT d.id) AS deal_count,
    COUNT(DISTINCT d.id) FILTER (WHERE d.stage = 'closed_won') AS deals_won,
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,
    COALESCE(AVG(d.funded_amount) FILTER (WHERE d.funded_amount > 0), 0) AS avg_deal_size
FROM leads l
LEFT JOIN deals d ON d.lead_id = l.id AND d.is_deleted = FALSE
WHERE l.is_deleted = FALSE
GROUP BY l.source_type
ORDER BY total_revenue DESC;

-- Add comments
COMMENT ON TYPE deal_stage IS 'Simplified IRA deal pipeline: Deal Opened -> Proposal/Education -> Paperwork Sent -> Paperwork Complete -> Funding In Progress -> Closed (Won/Lost)';
COMMENT ON VIEW v_rep_performance IS 'Comprehensive sales rep performance metrics across time periods';
COMMENT ON VIEW v_deal_pipeline IS 'Aggregated pipeline view by stage with weighted values';
COMMENT ON VIEW v_team_performance IS 'Team-level performance aggregation';
COMMENT ON VIEW v_campaign_performance IS 'Marketing campaign ROI and conversion metrics';
COMMENT ON VIEW v_executive_dashboard IS 'Company-wide KPIs for executive dashboard';
COMMENT ON VIEW v_time_to_close IS 'Average time spent in each pipeline stage';
COMMENT ON VIEW v_lead_source_attribution IS 'Lead source effectiveness and revenue attribution';
