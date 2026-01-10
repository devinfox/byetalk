-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00010: Seed Data for Development
-- ============================================================================

-- NOTE: Only run this in development! Remove or skip in production.

-- ============================================================================
-- CREATE DEMO TEAM STRUCTURE
-- ============================================================================

-- Insert teams (manager_id will be updated after users are created)
INSERT INTO teams (id, name, description) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Team Alpha', 'Primary sales team'),
    ('22222222-2222-2222-2222-222222222222', 'Sales Team Beta', 'Secondary sales team'),
    ('33333333-3333-3333-3333-333333333333', 'Closers', 'Senior closers team');

-- ============================================================================
-- CREATE DEMO USERS
-- ============================================================================

-- Note: In production, users are created through Supabase Auth
-- These are demo users with NULL auth_id (will need to be linked)

INSERT INTO users (id, email, first_name, last_name, role, team_id, hire_date, base_commission_rate) VALUES
    -- Admins
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com', 'System', 'Admin', 'super_admin', NULL, '2020-01-01', 0.0000),

    -- Managers
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'manager1@example.com', 'Mike', 'Manager', 'manager', '11111111-1111-1111-1111-111111111111', '2021-01-15', 0.0050),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'manager2@example.com', 'Mary', 'Manager', 'manager', '22222222-2222-2222-2222-222222222222', '2021-03-01', 0.0050),

    -- Sales Reps - Team Alpha
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'rep1@example.com', 'Alice', 'Rep', 'sales_rep', '11111111-1111-1111-1111-111111111111', '2022-06-01', 0.0200),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'rep2@example.com', 'Bob', 'Rep', 'sales_rep', '11111111-1111-1111-1111-111111111111', '2022-08-15', 0.0200),

    -- Sales Reps - Team Beta
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'rep3@example.com', 'Carol', 'Rep', 'sales_rep', '22222222-2222-2222-2222-222222222222', '2023-01-10', 0.0200),
    ('00000000-0000-0000-0000-000000000001', 'rep4@example.com', 'David', 'Rep', 'sales_rep', '22222222-2222-2222-2222-222222222222', '2023-03-20', 0.0200),

    -- Closers
    ('00000000-0000-0000-0000-000000000002', 'closer1@example.com', 'Eric', 'Closer', 'closer', '33333333-3333-3333-3333-333333333333', '2021-06-01', 0.0300),
    ('00000000-0000-0000-0000-000000000003', 'closer2@example.com', 'Fiona', 'Closer', 'closer', '33333333-3333-3333-3333-333333333333', '2022-01-15', 0.0300);

-- Update team managers
UPDATE teams SET manager_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE teams SET manager_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE teams SET manager_id = '00000000-0000-0000-0000-000000000002' WHERE id = '33333333-3333-3333-3333-333333333333';

-- Set reports_to
UPDATE users SET reports_to = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id IN ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
UPDATE users SET reports_to = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE id IN ('ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-0000-0000-0000-000000000001');
UPDATE users SET reports_to = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE id IN ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- ============================================================================
-- CREATE DEMO CAMPAIGNS
-- ============================================================================

INSERT INTO campaigns (id, name, code, source_type, tracking_phone, is_active, use_round_robin, assigned_team_id) VALUES
    ('44444444-4444-4444-4444-444444444444', 'Google PPC - Gold IRA', 'PPC-GOOGLE-GOLD', 'ppc', '+18005551001', TRUE, TRUE, '11111111-1111-1111-1111-111111111111'),
    ('55555555-5555-5555-5555-555555555555', 'Facebook Ads - Retirement', 'PPC-FB-RETIRE', 'ppc', '+18005551002', TRUE, TRUE, '22222222-2222-2222-2222-222222222222'),
    ('66666666-6666-6666-6666-666666666666', 'Organic SEO', 'ORG-SEO', 'organic', '+18005551003', TRUE, TRUE, NULL),
    ('77777777-7777-7777-7777-777777777777', 'Radio - AM Talk Shows', 'RADIO-AM', 'radio', '+18005551004', TRUE, FALSE, '11111111-1111-1111-1111-111111111111'),
    ('88888888-8888-8888-8888-888888888888', 'Customer Referrals', 'REF-CUST', 'referral', NULL, TRUE, TRUE, NULL);

-- ============================================================================
-- CREATE DEMO COMMISSION RULES
-- ============================================================================

INSERT INTO commission_rules (name, description, applies_to_role, rule_type, base_rate, is_active) VALUES
    ('Base Rep Commission', 'Standard commission rate for sales reps', 'sales_rep', 'base_rate', 0.0200, TRUE),
    ('Senior Rep Commission', 'Higher rate for senior reps', 'senior_rep', 'base_rate', 0.0250, TRUE),
    ('Closer Commission', 'Commission rate for closers', 'closer', 'base_rate', 0.0300, TRUE),
    ('Manager Override', 'Override commission for managers on team sales', 'manager', 'override', 0.0050, TRUE);

INSERT INTO commission_rules (name, description, rule_type, tier_structure, is_active) VALUES
    ('High Value Deal Bonus', 'Bonus for deals over $100k', 'tiered',
     '[{"min": 0, "max": 50000, "rate": 0.02}, {"min": 50000, "max": 100000, "rate": 0.025}, {"min": 100000, "max": null, "rate": 0.03}]',
     TRUE);

-- ============================================================================
-- CREATE SAMPLE LEADS AND DEALS (for testing)
-- ============================================================================

-- Sample leads
INSERT INTO leads (id, first_name, last_name, email, phone, status, source_type, campaign_id, owner_id, score) VALUES
    ('99999999-9999-9999-9999-999999999999', 'John', 'Smith', 'john.smith@email.com', '+15551234567', 'new', 'ppc', '44444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 75),
    ('99999999-9999-9999-9999-999999999998', 'Jane', 'Doe', 'jane.doe@email.com', '+15551234568', 'contacted', 'organic', '66666666-6666-6666-6666-666666666666', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 60),
    ('99999999-9999-9999-9999-999999999997', 'Robert', 'Johnson', 'robert.j@email.com', '+15551234569', 'qualified', 'radio', '77777777-7777-7777-7777-777777777777', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 85);

-- Sample contacts (converted leads)
INSERT INTO contacts (id, lead_id, first_name, last_name, email, phone, owner_id, date_of_birth, annual_income_range) VALUES
    ('aaaaaaaa-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999997', 'Robert', 'Johnson', 'robert.j@email.com', '+15551234569', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '1965-03-15', '$100k-$250k');

-- Sample deal (will trigger deal_created event and revenue summary)
-- Note: The trigger will handle stage history and revenue summary creation
INSERT INTO deals (
    id, name, deal_type, stage, contact_id, lead_id, owner_id,
    estimated_value, campaign_id, source_type, custodian_name, ira_type
) VALUES (
    'bbbbbbbb-1111-1111-1111-111111111111',
    'Johnson IRA Rollover',
    'ira_rollover',
    'discovery',
    'aaaaaaaa-1111-1111-1111-111111111111',
    '99999999-9999-9999-9999-999999999997',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    150000.00,
    '77777777-7777-7777-7777-777777777777',
    'radio',
    'Equity Trust',
    'Traditional'
);

-- Update lead to converted status
UPDATE leads
SET status = 'converted',
    converted_contact_id = 'aaaaaaaa-1111-1111-1111-111111111111',
    converted_deal_id = 'bbbbbbbb-1111-1111-1111-111111111111'
WHERE id = '99999999-9999-9999-9999-999999999997';

COMMENT ON TABLE teams IS 'Demo teams for development - replace with actual teams';
