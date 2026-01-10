-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00003: Deals and Pipeline Management
-- ============================================================================

-- ============================================================================
-- DEAL STAGE CONFIGURATION (Customizable pipeline)
-- ============================================================================

CREATE TABLE deal_stage_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Stage definition
    stage deal_stage NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL,

    -- Stage settings
    probability DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- 0-100%
    is_won_stage BOOLEAN DEFAULT FALSE,
    is_lost_stage BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Required fields at this stage
    required_fields JSONB DEFAULT '[]',

    -- Automation rules (JSON for flexibility)
    -- e.g., {"notify_manager": true, "send_email_template": "proposal_sent"}
    automation_rules JSONB DEFAULT '{}',

    -- Time tracking
    expected_days_in_stage INTEGER, -- SLA/expected time
    alert_after_days INTEGER, -- Alert if stuck

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default IRA pipeline stages
INSERT INTO deal_stage_config (stage, display_name, description, display_order, probability, is_won_stage, is_lost_stage, expected_days_in_stage)
VALUES
    ('new_opportunity', 'New Opportunity', 'Fresh lead, not yet contacted', 1, 5.00, FALSE, FALSE, 1),
    ('initial_contact', 'Initial Contact', 'First conversation made', 2, 10.00, FALSE, FALSE, 2),
    ('discovery', 'Discovery', 'Understanding client needs and goals', 3, 20.00, FALSE, FALSE, 3),
    ('proposal_sent', 'Proposal Sent', 'Investment proposal delivered', 4, 35.00, FALSE, FALSE, 5),
    ('agreement_signed', 'Agreement Signed', 'Client has signed paperwork', 5, 50.00, FALSE, FALSE, 3),
    ('paperwork_submitted', 'Paperwork Submitted', 'Documents sent to custodian', 6, 65.00, FALSE, FALSE, 7),
    ('custodian_approved', 'Custodian Approved', 'Account approved by custodian', 7, 75.00, FALSE, FALSE, 5),
    ('funding_pending', 'Funding Pending', 'Waiting for funds transfer', 8, 85.00, FALSE, FALSE, 14),
    ('funds_received', 'Funds Received', 'Money received in IRA account', 9, 95.00, FALSE, FALSE, 3),
    ('metals_purchased', 'Metals Purchased', 'Precious metals bought', 10, 98.00, FALSE, FALSE, 2),
    ('closed_won', 'Closed Won', 'Deal completed successfully', 11, 100.00, TRUE, FALSE, NULL),
    ('closed_lost', 'Closed Lost', 'Deal did not close', 12, 0.00, FALSE, TRUE, NULL);

-- ============================================================================
-- DEALS (Core revenue entity)
-- ============================================================================

CREATE TABLE deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Deal identification
    deal_number SERIAL, -- Human-readable deal number
    name VARCHAR(200) NOT NULL,

    -- Type and stage
    deal_type deal_type NOT NULL,
    stage deal_stage NOT NULL DEFAULT 'new_opportunity',
    stage_entered_at TIMESTAMPTZ DEFAULT NOW(),

    -- Relationships
    contact_id UUID REFERENCES contacts(id),
    lead_id UUID REFERENCES leads(id),

    -- Ownership (current)
    owner_id UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),

    -- Secondary owner (for splits)
    secondary_owner_id UUID REFERENCES users(id),
    secondary_owner_split DECIMAL(5,2) DEFAULT 0.00, -- Percentage to secondary

    -- Original owner (for TO tracking)
    original_owner_id UUID REFERENCES users(id),

    -- =========================================================================
    -- MONETARY TRACKING (Critical for business)
    -- =========================================================================

    -- Estimated values (during sales process)
    estimated_value DECIMAL(14,2) DEFAULT 0.00, -- Expected investment amount
    estimated_close_date DATE,

    -- Actual values (after funding)
    funded_amount DECIMAL(14,2) DEFAULT 0.00, -- Actual $ that came in

    -- Metal purchase details
    metal_type VARCHAR(50), -- gold, silver, platinum, palladium
    metal_weight_oz DECIMAL(12,4), -- Ounces purchased
    metal_spot_price DECIMAL(12,2), -- Spot price at purchase
    metal_purchase_price DECIMAL(14,2), -- Total metal cost

    -- Revenue calculation
    spread_amount DECIMAL(12,2) DEFAULT 0.00, -- funded_amount - metal_purchase_price
    spread_percentage DECIMAL(6,4) DEFAULT 0.0000, -- spread / funded_amount
    gross_revenue DECIMAL(12,2) DEFAULT 0.00, -- Company gross on this deal

    -- Commission tracking
    commissionable_amount DECIMAL(12,2) DEFAULT 0.00, -- Amount commission is based on
    total_commission_paid DECIMAL(12,2) DEFAULT 0.00, -- Sum of all commissions

    -- =========================================================================
    -- KEY TIMESTAMPS
    -- =========================================================================
    proposal_sent_at TIMESTAMPTZ,
    agreement_signed_at TIMESTAMPTZ,
    paperwork_submitted_at TIMESTAMPTZ,
    custodian_approved_at TIMESTAMPTZ,
    funds_received_at TIMESTAMPTZ,
    metals_purchased_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    closed_lost_at TIMESTAMPTZ,

    -- Lost deal tracking
    lost_reason VARCHAR(200),
    lost_reason_notes TEXT,
    competitor_lost_to VARCHAR(200),

    -- =========================================================================
    -- SOURCE ATTRIBUTION
    -- =========================================================================
    campaign_id UUID REFERENCES campaigns(id),
    source_type lead_source_type,
    referral_source TEXT,

    -- Original call that created this deal
    source_call_id UUID, -- Set after calls table

    -- =========================================================================
    -- IRA-SPECIFIC FIELDS
    -- =========================================================================
    custodian_name VARCHAR(200),
    custodian_account_number VARCHAR(100),
    ira_type VARCHAR(50), -- Traditional, Roth, SEP, SIMPLE
    rollover_source VARCHAR(200), -- Where funds coming from
    rollover_amount DECIMAL(14,2),

    -- =========================================================================
    -- METADATA
    -- =========================================================================
    tags TEXT[], -- Flexible tagging
    custom_fields JSONB DEFAULT '{}',
    notes TEXT,

    -- Priority (1=highest, 5=lowest)
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update leads with deal FK
ALTER TABLE leads ADD CONSTRAINT fk_leads_converted_deal
    FOREIGN KEY (converted_deal_id) REFERENCES deals(id);

-- Indexes for deals (critical for performance)
CREATE INDEX idx_deals_number ON deals(deal_number) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_stage ON deals(stage) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_owner ON deals(owner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_contact ON deals(contact_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_created ON deals(created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_closed ON deals(closed_at DESC) WHERE is_deleted = FALSE AND stage = 'closed_won';
CREATE INDEX idx_deals_funded ON deals(funded_amount DESC) WHERE is_deleted = FALSE AND funded_amount > 0;
CREATE INDEX idx_deals_campaign ON deals(campaign_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_source ON deals(source_type) WHERE is_deleted = FALSE;

-- Composite indexes for common queries
CREATE INDEX idx_deals_owner_stage ON deals(owner_id, stage) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_owner_created ON deals(owner_id, created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_deals_stage_created ON deals(stage, created_at DESC) WHERE is_deleted = FALSE;

-- Date-based indexes for reporting
CREATE INDEX idx_deals_funds_received ON deals(funds_received_at DESC)
    WHERE is_deleted = FALSE AND funds_received_at IS NOT NULL;
CREATE INDEX idx_deals_metals_purchased ON deals(metals_purchased_at DESC)
    WHERE is_deleted = FALSE AND metals_purchased_at IS NOT NULL;

-- ============================================================================
-- DEAL STAGE HISTORY (Track all stage changes)
-- ============================================================================

CREATE TABLE deal_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    deal_id UUID NOT NULL REFERENCES deals(id),

    -- Stage transition
    from_stage deal_stage,
    to_stage deal_stage NOT NULL,

    -- Who and when
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Time in previous stage (calculated)
    time_in_stage_seconds INTEGER,

    -- Reason for change
    reason TEXT,

    -- Snapshot of deal values at this stage
    deal_value_snapshot DECIMAL(14,2),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX idx_deal_stage_history_to ON deal_stage_history(to_stage);
CREATE INDEX idx_deal_stage_history_changed ON deal_stage_history(changed_at DESC);
CREATE INDEX idx_deal_stage_history_changed_by ON deal_stage_history(changed_by);

-- ============================================================================
-- DEAL CONTACTS (Many-to-many: deals can have multiple contacts)
-- ============================================================================

CREATE TABLE deal_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    deal_id UUID NOT NULL REFERENCES deals(id),
    contact_id UUID NOT NULL REFERENCES contacts(id),

    -- Role in the deal
    role VARCHAR(50) DEFAULT 'primary', -- primary, spouse, beneficiary, advisor
    is_primary BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(deal_id, contact_id)
);

CREATE INDEX idx_deal_contacts_deal ON deal_contacts(deal_id);
CREATE INDEX idx_deal_contacts_contact ON deal_contacts(contact_id);

COMMENT ON TABLE deals IS 'Core revenue entity - every IRA transaction is a deal';
COMMENT ON COLUMN deals.funded_amount IS 'Actual dollars received into the IRA account';
COMMENT ON COLUMN deals.spread_amount IS 'Gross profit = funded_amount - metal_purchase_price';
COMMENT ON COLUMN deals.commissionable_amount IS 'Base amount for commission calculation';
COMMENT ON TABLE deal_stage_history IS 'Complete audit trail of all deal stage changes';
