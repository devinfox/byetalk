-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00002: Core Tables (Users, Teams, Campaigns, Leads, Contacts)
-- ============================================================================

-- ============================================================================
-- TEAMS / ORGANIZATION STRUCTURE
-- ============================================================================

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    manager_id UUID, -- Set after users table created
    parent_team_id UUID REFERENCES teams(id),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_teams_manager ON teams(manager_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_teams_parent ON teams(parent_team_id) WHERE is_deleted = FALSE;

-- ============================================================================
-- USERS (Sales Reps, Managers, Admins)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Supabase Auth link
    auth_id UUID UNIQUE, -- Links to auth.users.id

    -- Profile
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,

    -- Role & Organization
    role user_role NOT NULL DEFAULT 'sales_rep',
    team_id UUID REFERENCES teams(id),
    reports_to UUID REFERENCES users(id),

    -- Employment details
    hire_date DATE,
    employee_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,

    -- Commission settings
    base_commission_rate DECIMAL(5,4) DEFAULT 0.0000, -- e.g., 0.0250 = 2.5%
    override_commission_rate DECIMAL(5,4) DEFAULT 0.0000,

    -- Round-robin assignment weight (higher = more leads)
    assignment_weight INTEGER DEFAULT 100,
    is_available_for_assignment BOOLEAN DEFAULT TRUE,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add manager FK to teams now that users exists
ALTER TABLE teams ADD CONSTRAINT fk_teams_manager
    FOREIGN KEY (manager_id) REFERENCES users(id);

CREATE INDEX idx_users_email ON users(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_auth ON users(auth_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_team ON users(team_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_role ON users(role) WHERE is_deleted = FALSE AND is_active = TRUE;
CREATE INDEX idx_users_reports_to ON users(reports_to) WHERE is_deleted = FALSE;
CREATE INDEX idx_users_available ON users(is_available_for_assignment)
    WHERE is_deleted = FALSE AND is_active = TRUE AND is_available_for_assignment = TRUE;

-- ============================================================================
-- CAMPAIGNS / MARKETING SOURCES
-- ============================================================================

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(200) NOT NULL,
    code VARCHAR(50) UNIQUE, -- e.g., "PPC-GOOGLE-GOLD-2024"
    description TEXT,

    -- Source categorization
    source_type lead_source_type NOT NULL,

    -- Tracking
    tracking_phone VARCHAR(20), -- Dedicated phone number for this campaign
    tracking_url TEXT,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),

    -- Budget & performance
    budget_amount DECIMAL(12,2),
    cost_per_lead DECIMAL(10,2),

    -- Assignment rules
    assigned_team_id UUID REFERENCES teams(id),
    assigned_user_id UUID REFERENCES users(id),
    use_round_robin BOOLEAN DEFAULT TRUE,

    -- Active period
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_code ON campaigns(code) WHERE is_deleted = FALSE;
CREATE INDEX idx_campaigns_phone ON campaigns(tracking_phone) WHERE is_deleted = FALSE;
CREATE INDEX idx_campaigns_active ON campaigns(is_active) WHERE is_deleted = FALSE AND is_active = TRUE;
CREATE INDEX idx_campaigns_source ON campaigns(source_type) WHERE is_deleted = FALSE;

-- ============================================================================
-- LEADS
-- ============================================================================

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Basic info
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    phone_secondary VARCHAR(20),

    -- Address
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'USA',

    -- Lead qualification
    status lead_status NOT NULL DEFAULT 'new',
    score INTEGER DEFAULT 0, -- 0-100 lead score

    -- Source tracking
    source_type lead_source_type,
    campaign_id UUID REFERENCES campaigns(id),
    referral_source TEXT,
    landing_page_url TEXT,

    -- UTM tracking
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_content VARCHAR(100),
    utm_term VARCHAR(100),

    -- Initial call info (if created from call)
    initial_call_id UUID, -- Set after calls table exists

    -- Ownership
    owner_id UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ,

    -- Conversion tracking
    converted_at TIMESTAMPTZ,
    converted_deal_id UUID, -- Set after deals table exists
    converted_contact_id UUID, -- Set after contacts table exists

    -- Notes
    notes TEXT,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_status ON leads(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_owner ON leads(owner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_email ON leads(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_phone ON leads(phone) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_campaign ON leads(campaign_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_source ON leads(source_type) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_created ON leads(created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_leads_score ON leads(score DESC) WHERE is_deleted = FALSE AND status NOT IN ('converted', 'dead');

-- Full text search on leads
CREATE INDEX idx_leads_search ON leads USING gin(
    (first_name || ' ' || last_name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, ''))
    gin_trgm_ops
) WHERE is_deleted = FALSE;

-- ============================================================================
-- CONTACTS (Converted leads, multiple per deal possible)
-- ============================================================================

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Link to original lead
    lead_id UUID REFERENCES leads(id),

    -- Personal info
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    phone_secondary VARCHAR(20),

    -- Address
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'USA',

    -- IRA-specific info
    date_of_birth DATE,
    ssn_last_four VARCHAR(4),
    employer VARCHAR(200),
    occupation VARCHAR(100),

    -- Account info
    preferred_contact_method VARCHAR(20) DEFAULT 'phone',
    best_time_to_call VARCHAR(50),
    timezone VARCHAR(50),

    -- Compliance
    is_accredited_investor BOOLEAN,
    annual_income_range VARCHAR(50),
    net_worth_range VARCHAR(50),
    investment_experience VARCHAR(50),

    -- Relationships
    spouse_name VARCHAR(200),
    beneficiary_info JSONB,

    -- Ownership
    owner_id UUID REFERENCES users(id),

    -- Notes
    notes TEXT,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_lead ON contacts(lead_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_contacts_owner ON contacts(owner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_contacts_email ON contacts(email) WHERE is_deleted = FALSE;
CREATE INDEX idx_contacts_phone ON contacts(phone) WHERE is_deleted = FALSE;

-- Full text search on contacts
CREATE INDEX idx_contacts_search ON contacts USING gin(
    (first_name || ' ' || last_name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, ''))
    gin_trgm_ops
) WHERE is_deleted = FALSE;

-- Update leads with contact FK
ALTER TABLE leads ADD CONSTRAINT fk_leads_converted_contact
    FOREIGN KEY (converted_contact_id) REFERENCES contacts(id);

COMMENT ON TABLE users IS 'All CRM users including sales reps, managers, and admins';
COMMENT ON TABLE leads IS 'Potential customers before qualification/conversion';
COMMENT ON TABLE contacts IS 'Qualified contacts, typically converted from leads';
COMMENT ON TABLE campaigns IS 'Marketing campaigns and lead sources for attribution';
