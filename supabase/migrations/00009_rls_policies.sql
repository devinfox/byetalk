-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00009: Row Level Security (RLS) Policies
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================================================

-- Get the current user's ID from the JWT
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS UUID AS $$
    SELECT COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid,
        (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get current user's CRM user record
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
    SELECT id FROM users WHERE auth_id = auth.uid() AND is_deleted = FALSE LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get current user's role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
    SELECT role FROM users WHERE auth_id = auth.uid() AND is_deleted = FALSE LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM users
        WHERE auth_id = auth.uid()
          AND is_deleted = FALSE
          AND role IN ('admin', 'super_admin')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user is manager or above
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM users
        WHERE auth_id = auth.uid()
          AND is_deleted = FALSE
          AND role IN ('manager', 'admin', 'super_admin')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get team IDs that current user manages (including child teams)
CREATE OR REPLACE FUNCTION get_managed_team_ids()
RETURNS SETOF UUID AS $$
    WITH RECURSIVE team_tree AS (
        -- Teams directly managed by user
        SELECT t.id
        FROM teams t
        WHERE t.manager_id = get_current_user_id()
          AND t.is_deleted = FALSE

        UNION ALL

        -- Child teams
        SELECT t.id
        FROM teams t
        JOIN team_tree tt ON t.parent_team_id = tt.id
        WHERE t.is_deleted = FALSE
    )
    SELECT id FROM team_tree;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Get user IDs that current user manages
CREATE OR REPLACE FUNCTION get_managed_user_ids()
RETURNS SETOF UUID AS $$
    -- Direct reports
    SELECT id FROM users
    WHERE reports_to = get_current_user_id()
      AND is_deleted = FALSE

    UNION

    -- Users in managed teams
    SELECT id FROM users
    WHERE team_id IN (SELECT get_managed_team_ids())
      AND is_deleted = FALSE;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_revenue_summary ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Everyone can read basic user info (needed for assignments, etc.)
CREATE POLICY users_select ON users
    FOR SELECT
    USING (is_deleted = FALSE);

-- Users can update their own profile
CREATE POLICY users_update_own ON users
    FOR UPDATE
    USING (auth_id = auth.uid())
    WITH CHECK (auth_id = auth.uid());

-- Admins can update any user
CREATE POLICY users_update_admin ON users
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

-- Only admins can insert users
CREATE POLICY users_insert ON users
    FOR INSERT
    WITH CHECK (is_admin());

-- ============================================================================
-- TEAMS TABLE POLICIES
-- ============================================================================

-- Everyone can read teams
CREATE POLICY teams_select ON teams
    FOR SELECT
    USING (is_deleted = FALSE);

-- Only admins can modify teams
CREATE POLICY teams_insert ON teams
    FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY teams_update ON teams
    FOR UPDATE
    USING (is_admin())
    WITH CHECK (is_admin());

-- ============================================================================
-- CAMPAIGNS TABLE POLICIES
-- ============================================================================

-- Everyone can read active campaigns
CREATE POLICY campaigns_select ON campaigns
    FOR SELECT
    USING (is_deleted = FALSE);

-- Managers and above can modify campaigns
CREATE POLICY campaigns_modify ON campaigns
    FOR ALL
    USING (is_manager_or_above())
    WITH CHECK (is_manager_or_above());

-- ============================================================================
-- LEADS TABLE POLICIES
-- ============================================================================

-- Reps can see their own leads
CREATE POLICY leads_select_own ON leads
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            owner_id = get_current_user_id()
            OR is_manager_or_above()
            OR owner_id IN (SELECT get_managed_user_ids())
        )
    );

-- Reps can update their own leads
CREATE POLICY leads_update_own ON leads
    FOR UPDATE
    USING (owner_id = get_current_user_id() OR is_manager_or_above())
    WITH CHECK (owner_id = get_current_user_id() OR is_manager_or_above());

-- System/admins can insert leads
CREATE POLICY leads_insert ON leads
    FOR INSERT
    WITH CHECK (TRUE); -- Leads can be created by system/webhooks

-- ============================================================================
-- CONTACTS TABLE POLICIES
-- ============================================================================

-- Same pattern as leads
CREATE POLICY contacts_select ON contacts
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            owner_id = get_current_user_id()
            OR is_manager_or_above()
            OR owner_id IN (SELECT get_managed_user_ids())
        )
    );

CREATE POLICY contacts_update ON contacts
    FOR UPDATE
    USING (owner_id = get_current_user_id() OR is_manager_or_above())
    WITH CHECK (owner_id = get_current_user_id() OR is_manager_or_above());

CREATE POLICY contacts_insert ON contacts
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- DEALS TABLE POLICIES
-- ============================================================================

-- Reps can see their own deals and deals of reports
CREATE POLICY deals_select ON deals
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            owner_id = get_current_user_id()
            OR secondary_owner_id = get_current_user_id()
            OR is_manager_or_above()
            OR owner_id IN (SELECT get_managed_user_ids())
        )
    );

-- Reps can update their own deals
CREATE POLICY deals_update ON deals
    FOR UPDATE
    USING (owner_id = get_current_user_id() OR is_manager_or_above())
    WITH CHECK (owner_id = get_current_user_id() OR is_manager_or_above());

CREATE POLICY deals_insert ON deals
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- DEAL STAGE HISTORY POLICIES
-- ============================================================================

-- Can read history for deals you can see
CREATE POLICY deal_stage_history_select ON deal_stage_history
    FOR SELECT
    USING (
        deal_id IN (
            SELECT id FROM deals
            WHERE is_deleted = FALSE
              AND (
                  owner_id = get_current_user_id()
                  OR is_manager_or_above()
                  OR owner_id IN (SELECT get_managed_user_ids())
              )
        )
    );

-- System inserts only
CREATE POLICY deal_stage_history_insert ON deal_stage_history
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- CALLS TABLE POLICIES
-- ============================================================================

CREATE POLICY calls_select ON calls
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            user_id = get_current_user_id()
            OR is_manager_or_above()
            OR user_id IN (SELECT get_managed_user_ids())
        )
    );

CREATE POLICY calls_insert ON calls
    FOR INSERT
    WITH CHECK (TRUE); -- System can insert calls

CREATE POLICY calls_update ON calls
    FOR UPDATE
    USING (user_id = get_current_user_id() OR is_manager_or_above());

-- ============================================================================
-- FORM SUBMISSIONS POLICIES
-- ============================================================================

CREATE POLICY form_submissions_select ON form_submissions
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            assigned_to = get_current_user_id()
            OR is_manager_or_above()
        )
    );

CREATE POLICY form_submissions_insert ON form_submissions
    FOR INSERT
    WITH CHECK (TRUE); -- Webhooks insert forms

-- ============================================================================
-- FUNDING EVENTS POLICIES
-- ============================================================================

CREATE POLICY funding_events_select ON funding_events
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND deal_id IN (
            SELECT id FROM deals
            WHERE is_deleted = FALSE
              AND (
                  owner_id = get_current_user_id()
                  OR is_manager_or_above()
              )
        )
    );

CREATE POLICY funding_events_insert ON funding_events
    FOR INSERT
    WITH CHECK (is_manager_or_above());

-- ============================================================================
-- TURNOVERS POLICIES
-- ============================================================================

CREATE POLICY turnovers_select ON turnovers
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            from_user_id = get_current_user_id()
            OR to_user_id = get_current_user_id()
            OR initiated_by = get_current_user_id()
            OR is_manager_or_above()
        )
    );

CREATE POLICY turnovers_insert ON turnovers
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- COMMISSIONS POLICIES
-- ============================================================================

-- Reps can see their own commissions
CREATE POLICY commissions_select_own ON commissions
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            user_id = get_current_user_id()
            OR is_manager_or_above()
        )
    );

-- Only admins/managers can modify commissions
CREATE POLICY commissions_modify ON commissions
    FOR ALL
    USING (is_manager_or_above())
    WITH CHECK (is_manager_or_above());

-- ============================================================================
-- COMMISSION RULES POLICIES
-- ============================================================================

-- Everyone can read rules
CREATE POLICY commission_rules_select ON commission_rules
    FOR SELECT
    USING (is_deleted = FALSE);

-- Only admins can modify
CREATE POLICY commission_rules_modify ON commission_rules
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- ============================================================================
-- ACTIVITY LOG POLICIES
-- ============================================================================

-- Can read activity for entities you have access to
CREATE POLICY activity_log_select ON activity_log
    FOR SELECT
    USING (
        user_id = get_current_user_id()
        OR is_manager_or_above()
        OR (
            deal_id IN (
                SELECT id FROM deals
                WHERE owner_id = get_current_user_id()
            )
        )
    );

-- System inserts only
CREATE POLICY activity_log_insert ON activity_log
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- SYSTEM EVENTS POLICIES
-- ============================================================================

-- Only admins can see system events
CREATE POLICY system_events_select ON system_events
    FOR SELECT
    USING (is_admin());

CREATE POLICY system_events_insert ON system_events
    FOR INSERT
    WITH CHECK (TRUE); -- Triggers insert

-- ============================================================================
-- NOTES POLICIES
-- ============================================================================

CREATE POLICY notes_select ON notes
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            created_by = get_current_user_id()
            OR NOT is_private
            OR is_manager_or_above()
        )
    );

CREATE POLICY notes_insert ON notes
    FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY notes_update ON notes
    FOR UPDATE
    USING (created_by = get_current_user_id() OR is_admin());

-- ============================================================================
-- TASKS POLICIES
-- ============================================================================

CREATE POLICY tasks_select ON tasks
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            assigned_to = get_current_user_id()
            OR assigned_by = get_current_user_id()
            OR is_manager_or_above()
        )
    );

CREATE POLICY tasks_insert ON tasks
    FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY tasks_update ON tasks
    FOR UPDATE
    USING (
        assigned_to = get_current_user_id()
        OR assigned_by = get_current_user_id()
        OR is_manager_or_above()
    );

-- ============================================================================
-- DOCUMENTS POLICIES
-- ============================================================================

CREATE POLICY documents_select ON documents
    FOR SELECT
    USING (
        is_deleted = FALSE
        AND (
            uploaded_by = get_current_user_id()
            OR is_manager_or_above()
            OR deal_id IN (
                SELECT id FROM deals WHERE owner_id = get_current_user_id()
            )
        )
    );

CREATE POLICY documents_insert ON documents
    FOR INSERT
    WITH CHECK (TRUE);

-- ============================================================================
-- DEAL STAGE CONFIG POLICIES
-- ============================================================================

CREATE POLICY deal_stage_config_select ON deal_stage_config
    FOR SELECT
    USING (TRUE); -- Everyone can read stage config

CREATE POLICY deal_stage_config_modify ON deal_stage_config
    FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- ============================================================================
-- DEAL REVENUE SUMMARY POLICIES
-- ============================================================================

CREATE POLICY deal_revenue_summary_select ON deal_revenue_summary
    FOR SELECT
    USING (
        deal_id IN (
            SELECT id FROM deals
            WHERE is_deleted = FALSE
              AND (
                  owner_id = get_current_user_id()
                  OR is_manager_or_above()
              )
        )
    );

-- Triggers update only
CREATE POLICY deal_revenue_summary_insert ON deal_revenue_summary
    FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY deal_revenue_summary_update ON deal_revenue_summary
    FOR UPDATE
    USING (TRUE); -- Triggers only

COMMENT ON FUNCTION get_current_user_id() IS 'Returns the CRM user ID for the authenticated user';
COMMENT ON FUNCTION is_admin() IS 'Returns true if current user is admin or super_admin';
COMMENT ON FUNCTION is_manager_or_above() IS 'Returns true if current user is manager, admin, or super_admin';
COMMENT ON FUNCTION get_managed_team_ids() IS 'Returns team IDs managed by current user (recursive)';
COMMENT ON FUNCTION get_managed_user_ids() IS 'Returns user IDs that report to current user';
