-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00005: Financial Tracking (Transactions, Commissions, TOs)
-- ============================================================================

-- ============================================================================
-- FUNDING EVENTS (Money movement on deals)
-- ============================================================================

CREATE TABLE funding_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    deal_id UUID NOT NULL REFERENCES deals(id),

    -- Transaction details
    transaction_type transaction_type NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    description TEXT,

    -- For metal purchases
    metal_type VARCHAR(50),
    metal_weight_oz DECIMAL(12,4),
    metal_spot_price DECIMAL(12,2),
    metal_premium_per_oz DECIMAL(10,2),

    -- Source/destination
    source_account VARCHAR(200),
    destination_account VARCHAR(200),

    -- External references
    external_transaction_id VARCHAR(200),
    wire_reference VARCHAR(100),
    check_number VARCHAR(50),

    -- Timing
    transaction_date DATE NOT NULL,
    posted_at TIMESTAMPTZ,
    cleared_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, posted, cleared, failed, reversed
    failure_reason TEXT,

    -- Recorded by
    recorded_by UUID REFERENCES users(id),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_funding_events_deal ON funding_events(deal_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_funding_events_type ON funding_events(transaction_type) WHERE is_deleted = FALSE;
CREATE INDEX idx_funding_events_date ON funding_events(transaction_date DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_funding_events_status ON funding_events(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_funding_events_amount ON funding_events(amount DESC) WHERE is_deleted = FALSE;

-- ============================================================================
-- TURNOVERS (TO - Deal handoffs between reps)
-- ============================================================================

CREATE TABLE turnovers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    deal_id UUID NOT NULL REFERENCES deals(id),

    -- The handoff
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),

    -- Reason and context
    reason turnover_reason NOT NULL,
    reason_notes TEXT,

    -- Initiated by (might be manager)
    initiated_by UUID NOT NULL REFERENCES users(id),

    -- Approval workflow
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Status
    status VARCHAR(50) DEFAULT 'completed', -- pending, approved, completed, rejected

    -- =========================================================================
    -- REVENUE SPLIT CONFIGURATION
    -- =========================================================================

    -- Split type
    is_full_transfer BOOLEAN DEFAULT TRUE, -- If false, it's a split

    -- If split, define percentages
    from_user_split_percentage DECIMAL(5,2) DEFAULT 0.00,
    to_user_split_percentage DECIMAL(5,2) DEFAULT 100.00,

    -- Split effective date (for commission calculation)
    split_effective_at TIMESTAMPTZ DEFAULT NOW(),

    -- Deal value at time of TO
    deal_value_at_turnover DECIMAL(14,2),
    deal_stage_at_turnover deal_stage,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turnovers_deal ON turnovers(deal_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_turnovers_from ON turnovers(from_user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_turnovers_to ON turnovers(to_user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_turnovers_status ON turnovers(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_turnovers_created ON turnovers(created_at DESC) WHERE is_deleted = FALSE;

-- ============================================================================
-- COMMISSIONS (Detailed commission records)
-- ============================================================================

CREATE TABLE commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What this commission is for
    deal_id UUID NOT NULL REFERENCES deals(id),
    user_id UUID NOT NULL REFERENCES users(id),
    funding_event_id UUID REFERENCES funding_events(id),

    -- Commission type
    commission_type commission_type NOT NULL,

    -- Calculation
    base_amount DECIMAL(14,2) NOT NULL, -- Amount commission is calculated on
    commission_rate DECIMAL(6,4) NOT NULL, -- Rate applied (e.g., 0.0250 = 2.5%)
    commission_amount DECIMAL(12,2) NOT NULL, -- Actual commission earned

    -- For splits
    split_percentage DECIMAL(5,2) DEFAULT 100.00, -- % of commission this user gets
    original_commission_amount DECIMAL(12,2), -- Before split

    -- For overrides
    override_on_user_id UUID REFERENCES users(id), -- If this is an override commission
    override_level INTEGER, -- 1 = direct manager, 2 = manager's manager, etc.

    -- For clawbacks
    clawback_reason TEXT,
    original_commission_id UUID REFERENCES commissions(id),

    -- Payment tracking
    payment_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid, held
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(200),

    -- Period tracking
    commission_period DATE, -- Month this commission counts toward
    pay_period_start DATE,
    pay_period_end DATE,

    -- Notes
    notes TEXT,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commissions_deal ON commissions(deal_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_commissions_user ON commissions(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_commissions_type ON commissions(commission_type) WHERE is_deleted = FALSE;
CREATE INDEX idx_commissions_status ON commissions(payment_status) WHERE is_deleted = FALSE;
CREATE INDEX idx_commissions_period ON commissions(commission_period) WHERE is_deleted = FALSE;
CREATE INDEX idx_commissions_user_period ON commissions(user_id, commission_period) WHERE is_deleted = FALSE;
CREATE INDEX idx_commissions_created ON commissions(created_at DESC) WHERE is_deleted = FALSE;

-- ============================================================================
-- COMMISSION RULES (Configurable commission structures)
-- ============================================================================

CREATE TABLE commission_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Rule applicability
    applies_to_role user_role,
    applies_to_user_id UUID REFERENCES users(id),
    applies_to_deal_type deal_type,
    applies_to_campaign_id UUID REFERENCES campaigns(id),

    -- Rule type
    rule_type VARCHAR(50) NOT NULL, -- base_rate, tiered, bonus, override, split

    -- Base commission rate
    base_rate DECIMAL(6,4),

    -- Tiered structure (JSON for flexibility)
    -- e.g., [{"min": 0, "max": 50000, "rate": 0.02}, {"min": 50000, "max": null, "rate": 0.025}]
    tier_structure JSONB,

    -- Bonus rules
    bonus_threshold DECIMAL(14,2), -- Revenue threshold for bonus
    bonus_rate DECIMAL(6,4),
    bonus_flat_amount DECIMAL(12,2),

    -- Override rules (for managers)
    override_rate DECIMAL(6,4),
    override_levels INTEGER DEFAULT 1, -- How many levels up

    -- Date range
    effective_from DATE,
    effective_to DATE,

    -- Priority (higher = applied first)
    priority INTEGER DEFAULT 100,

    is_active BOOLEAN DEFAULT TRUE,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_rules_role ON commission_rules(applies_to_role)
    WHERE is_deleted = FALSE AND is_active = TRUE;
CREATE INDEX idx_commission_rules_user ON commission_rules(applies_to_user_id)
    WHERE is_deleted = FALSE AND is_active = TRUE;
CREATE INDEX idx_commission_rules_active ON commission_rules(is_active, priority DESC)
    WHERE is_deleted = FALSE;

-- ============================================================================
-- DEAL REVENUE SUMMARY (Materialized view alternative - table updated by triggers)
-- ============================================================================

CREATE TABLE deal_revenue_summary (
    deal_id UUID PRIMARY KEY REFERENCES deals(id),

    -- Totals from funding events
    total_funded DECIMAL(14,2) DEFAULT 0.00,
    total_withdrawn DECIMAL(14,2) DEFAULT 0.00,
    net_funded DECIMAL(14,2) DEFAULT 0.00,

    -- Metal purchases
    total_metal_cost DECIMAL(14,2) DEFAULT 0.00,
    total_metal_weight_oz DECIMAL(12,4) DEFAULT 0.00,

    -- Revenue
    gross_spread DECIMAL(14,2) DEFAULT 0.00,
    gross_revenue DECIMAL(14,2) DEFAULT 0.00,

    -- Commissions
    total_commissions DECIMAL(12,2) DEFAULT 0.00,
    net_revenue DECIMAL(14,2) DEFAULT 0.00, -- gross_revenue - total_commissions

    -- Counts
    funding_event_count INTEGER DEFAULT 0,
    commission_count INTEGER DEFAULT 0,

    -- Last updated
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE funding_events IS 'All money movements on deals - deposits, withdrawals, purchases';
COMMENT ON TABLE turnovers IS 'Deal handoffs between reps with revenue split tracking';
COMMENT ON TABLE commissions IS 'Individual commission records for each rep on each deal';
COMMENT ON TABLE commission_rules IS 'Configurable commission structures by role, user, or deal type';
COMMENT ON TABLE deal_revenue_summary IS 'Aggregated revenue metrics per deal, updated by triggers';
