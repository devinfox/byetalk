-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00008: Dashboard Views and Reporting Queries
-- ============================================================================

-- ============================================================================
-- REP PERFORMANCE VIEW (Daily/Weekly/Monthly stats per rep)
-- ============================================================================

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

    -- TODAY's stats
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.today), 0) AS today_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.today), 0) AS today_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.today) AS today_deals_funded,
    COUNT(rd.deal_id) FILTER (WHERE rd.created_at >= dr.today) AS today_deals_created,

    -- WEEK stats
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.week_start), 0) AS week_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.week_start), 0) AS week_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.week_start) AS week_deals_funded,
    COUNT(rd.deal_id) FILTER (WHERE rd.created_at >= dr.week_start) AS week_deals_created,

    -- MONTH stats
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) AS month_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) AS month_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.month_start) AS month_deals_funded,
    COUNT(rd.deal_id) FILTER (WHERE rd.created_at >= dr.month_start) AS month_deals_created,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1 AND rd.closed_at >= dr.month_start) AS month_deals_won,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1 AND rd.closed_at >= dr.month_start) AS month_deals_lost,

    -- QUARTER stats
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.quarter_start), 0) AS quarter_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.quarter_start), 0) AS quarter_revenue,

    -- YEAR stats
    COALESCE(SUM(rd.funded_amount) FILTER (WHERE rd.funds_received_at >= dr.year_start), 0) AS year_funded,
    COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.year_start), 0) AS year_revenue,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_funded = 1 AND rd.funds_received_at >= dr.year_start) AS year_deals_funded,

    -- ALL TIME stats
    COALESCE(SUM(rd.funded_amount), 0) AS total_funded,
    COALESCE(SUM(rd.gross_revenue), 0) AS total_revenue,
    COUNT(rd.deal_id) AS total_deals,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1) AS total_deals_won,
    COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1) AS total_deals_lost,

    -- AVERAGES
    COALESCE(AVG(rd.funded_amount) FILTER (WHERE rd.funded_amount > 0), 0) AS avg_deal_size,

    -- CLOSE RATE
    CASE
        WHEN (COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1) + COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1)) > 0
        THEN ROUND(
            COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1)::DECIMAL /
            (COUNT(rd.deal_id) FILTER (WHERE rd.is_won = 1) + COUNT(rd.deal_id) FILTER (WHERE rd.is_lost = 1)) * 100
        , 2)
        ELSE 0
    END AS close_rate_percent,

    -- CALL stats (month)
    COUNT(rc.call_id) FILTER (WHERE rc.started_at >= dr.month_start) AS month_calls,
    COALESCE(SUM(rc.duration_seconds) FILTER (WHERE rc.started_at >= dr.month_start), 0) AS month_talk_time_seconds,
    COUNT(rc.call_id) FILTER (WHERE rc.disposition = 'answered' AND rc.started_at >= dr.month_start) AS month_calls_answered,

    -- LEAD stats (month)
    COUNT(rl.lead_id) FILTER (WHERE rl.created_at >= dr.month_start) AS month_leads_assigned,
    COUNT(rl.lead_id) FILTER (WHERE rl.is_converted = 1 AND rl.created_at >= dr.month_start) AS month_leads_converted,

    -- REVENUE PER CALL (month)
    CASE
        WHEN COUNT(rc.call_id) FILTER (WHERE rc.started_at >= dr.month_start) > 0
        THEN ROUND(
            COALESCE(SUM(rd.gross_revenue) FILTER (WHERE rd.funds_received_at >= dr.month_start), 0) /
            COUNT(rc.call_id) FILTER (WHERE rc.started_at >= dr.month_start)
        , 2)
        ELSE 0
    END AS month_revenue_per_call,

    -- REVENUE PER LEAD (month)
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

-- ============================================================================
-- DEAL PIPELINE VIEW (Aggregated by stage)
-- ============================================================================

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
    -- Average time in stage
    AVG(EXTRACT(EPOCH FROM (NOW() - d.stage_entered_at)) / 86400)::INTEGER AS avg_days_in_stage
FROM deal_stage_config dsc
LEFT JOIN deals d ON d.stage = dsc.stage AND d.is_deleted = FALSE
WHERE dsc.is_active = TRUE
  AND NOT dsc.is_won_stage
  AND NOT dsc.is_lost_stage
GROUP BY dsc.stage, dsc.display_name, dsc.display_order, dsc.probability
ORDER BY dsc.display_order;

-- ============================================================================
-- TEAM PERFORMANCE VIEW
-- ============================================================================

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

    -- MONTH stats
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_revenue,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won' AND d.closed_at >= dr.month_start) AS month_deals_won,

    -- QUARTER stats
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_revenue,

    -- YEAR stats
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_revenue,

    -- ALL TIME
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,

    -- Per rep averages (month)
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

-- ============================================================================
-- CAMPAIGN PERFORMANCE VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_campaign_performance AS
WITH date_ranges AS (
    SELECT
        DATE_TRUNC('month', CURRENT_DATE)::DATE AS month_start
)
SELECT
    c.id AS campaign_id,
    c.name AS campaign_name,
    c.code AS campaign_code,
    c.source_type,

    -- Lead metrics
    COUNT(DISTINCT l.id) AS total_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= dr.month_start) AS month_leads,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') AS converted_leads,

    -- Conversion rate
    CASE
        WHEN COUNT(DISTINCT l.id) > 0
        THEN ROUND(COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted')::DECIMAL / COUNT(DISTINCT l.id) * 100, 2)
        ELSE 0
    END AS conversion_rate_percent,

    -- Deal metrics
    COUNT(DISTINCT d.id) AS total_deals,
    COUNT(DISTINCT d.id) FILTER (WHERE d.stage = 'closed_won') AS deals_won,
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,

    -- Call metrics
    COUNT(DISTINCT calls.id) AS total_calls,
    COALESCE(SUM(calls.duration_seconds), 0) AS total_talk_time_seconds,

    -- Form submission metrics
    COUNT(DISTINCT fs.id) AS total_form_submissions,

    -- Cost metrics
    c.budget_amount,
    c.cost_per_lead AS configured_cpl,
    CASE
        WHEN COUNT(DISTINCT l.id) > 0 AND c.budget_amount IS NOT NULL
        THEN ROUND(c.budget_amount / COUNT(DISTINCT l.id), 2)
        ELSE NULL
    END AS actual_cpl,

    -- ROI
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

-- ============================================================================
-- EXECUTIVE DASHBOARD VIEW (Company-wide metrics)
-- ============================================================================

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
    -- TODAY
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.today), 0) AS today_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.today), 0) AS today_revenue,
    COUNT(d.id) FILTER (WHERE d.created_at >= dr.today) AS today_deals_created,

    -- THIS WEEK
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.week_start), 0) AS week_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.week_start), 0) AS week_revenue,

    -- THIS MONTH
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) AS month_revenue,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won' AND d.closed_at >= dr.month_start) AS month_deals_won,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost' AND d.closed_at >= dr.month_start) AS month_deals_lost,
    COUNT(d.id) FILTER (WHERE d.created_at >= dr.month_start) AS month_deals_created,
    COALESCE(AVG(d.funded_amount) FILTER (WHERE d.funded_amount > 0 AND d.funds_received_at >= dr.month_start), 0) AS month_avg_deal_size,

    -- LAST MONTH (for comparison)
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0) AS last_month_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0) AS last_month_revenue,

    -- MoM GROWTH
    CASE
        WHEN COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0) > 0
        THEN ROUND(
            (COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.month_start), 0) -
             COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 0)) /
            COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.last_month_start AND d.funds_received_at < dr.month_start), 1) * 100
        , 2)
        ELSE 0
    END AS mom_revenue_growth_percent,

    -- THIS QUARTER
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.quarter_start), 0) AS quarter_revenue,

    -- THIS YEAR
    COALESCE(SUM(d.funded_amount) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_funded,
    COALESCE(SUM(d.gross_revenue) FILTER (WHERE d.funds_received_at >= dr.year_start), 0) AS year_revenue,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won' AND d.closed_at >= dr.year_start) AS year_deals_won,

    -- ALL TIME
    COALESCE(SUM(d.funded_amount), 0) AS total_funded,
    COALESCE(SUM(d.gross_revenue), 0) AS total_revenue,
    COUNT(d.id) AS total_deals,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_won') AS total_deals_won,
    COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost') AS total_deals_lost,
    COALESCE(AVG(d.funded_amount) FILTER (WHERE d.funded_amount > 0), 0) AS avg_deal_size,

    -- COMPANY CLOSE RATE
    CASE
        WHEN (COUNT(d.id) FILTER (WHERE d.stage = 'closed_won') + COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost')) > 0
        THEN ROUND(
            COUNT(d.id) FILTER (WHERE d.stage = 'closed_won')::DECIMAL /
            (COUNT(d.id) FILTER (WHERE d.stage = 'closed_won') + COUNT(d.id) FILTER (WHERE d.stage = 'closed_lost')) * 100
        , 2)
        ELSE 0
    END AS overall_close_rate_percent,

    -- PIPELINE VALUE (active deals)
    COALESCE(SUM(d.estimated_value) FILTER (WHERE d.stage NOT IN ('closed_won', 'closed_lost')), 0) AS pipeline_total_value,
    COUNT(d.id) FILTER (WHERE d.stage NOT IN ('closed_won', 'closed_lost')) AS pipeline_deal_count

FROM deals d
CROSS JOIN date_ranges dr
WHERE d.is_deleted = FALSE;

-- ============================================================================
-- TIME TO CLOSE VIEW (Average days by stage)
-- ============================================================================

CREATE OR REPLACE VIEW v_time_to_close AS
SELECT
    dsh.to_stage,
    dsc.display_name AS stage_name,
    dsc.display_order,
    COUNT(*) AS transition_count,
    ROUND(AVG(dsh.time_in_stage_seconds / 86400.0), 1) AS avg_days_in_previous_stage,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dsh.time_in_stage_seconds / 86400.0), 1) AS median_days_in_previous_stage,
    ROUND(MIN(dsh.time_in_stage_seconds / 86400.0), 1) AS min_days,
    ROUND(MAX(dsh.time_in_stage_seconds / 86400.0), 1) AS max_days
FROM deal_stage_history dsh
JOIN deal_stage_config dsc ON dsc.stage = dsh.to_stage
WHERE dsh.time_in_stage_seconds IS NOT NULL
  AND dsh.time_in_stage_seconds > 0
GROUP BY dsh.to_stage, dsc.display_name, dsc.display_order
ORDER BY dsc.display_order;

-- ============================================================================
-- LEAD SOURCE ATTRIBUTION VIEW
-- ============================================================================

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

COMMENT ON VIEW v_rep_performance IS 'Comprehensive sales rep performance metrics across time periods';
COMMENT ON VIEW v_deal_pipeline IS 'Aggregated pipeline view by stage with weighted values';
COMMENT ON VIEW v_team_performance IS 'Team-level performance aggregation';
COMMENT ON VIEW v_campaign_performance IS 'Marketing campaign ROI and conversion metrics';
COMMENT ON VIEW v_executive_dashboard IS 'Company-wide KPIs for executive dashboard';
COMMENT ON VIEW v_time_to_close IS 'Average time spent in each pipeline stage';
COMMENT ON VIEW v_lead_source_attribution IS 'Lead source effectiveness and revenue attribution';
