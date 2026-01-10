-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00004: Calls and Form Submissions
-- ============================================================================

-- ============================================================================
-- CALLS (First-class call records)
-- ============================================================================

CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Call identification
    external_call_id VARCHAR(200), -- ID from phone system
    call_sid VARCHAR(100), -- Twilio/phone system SID

    -- Direction and type
    direction call_direction NOT NULL,
    disposition call_disposition,

    -- Phone numbers
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    tracking_number VARCHAR(20), -- Campaign tracking number

    -- Duration
    duration_seconds INTEGER DEFAULT 0,
    ring_duration_seconds INTEGER,
    hold_duration_seconds INTEGER,
    talk_duration_seconds INTEGER,

    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL,
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Recording
    recording_url TEXT,
    recording_duration_seconds INTEGER,
    recording_status VARCHAR(50),

    -- Voicemail
    voicemail_url TEXT,
    voicemail_transcription TEXT,

    -- Relationships
    user_id UUID REFERENCES users(id), -- Rep who handled
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),
    deal_id UUID REFERENCES deals(id),
    campaign_id UUID REFERENCES campaigns(id),

    -- Source attribution
    source_type lead_source_type,

    -- Call outcome
    outcome_notes TEXT,
    callback_scheduled_at TIMESTAMPTZ,
    callback_notes TEXT,

    -- =========================================================================
    -- AI ANALYSIS (Future-proofing for call intelligence)
    -- =========================================================================
    ai_analysis_status ai_analysis_status DEFAULT 'pending',
    ai_analyzed_at TIMESTAMPTZ,

    -- Full transcription
    transcription TEXT,
    transcription_provider VARCHAR(50),

    -- AI-extracted data
    ai_summary TEXT,
    ai_sentiment VARCHAR(20), -- positive, neutral, negative
    ai_sentiment_score DECIMAL(5,4), -- -1 to 1
    ai_intent VARCHAR(100), -- buying, information, complaint, etc.
    ai_objections TEXT[], -- Array of detected objections
    ai_action_items TEXT[], -- Suggested next steps
    ai_key_topics TEXT[], -- Main topics discussed
    ai_competitor_mentions TEXT[], -- Competitors mentioned

    -- AI scoring
    ai_lead_quality_score INTEGER, -- 0-100
    ai_urgency_score INTEGER, -- 0-100
    ai_close_probability DECIMAL(5,2), -- 0-100%

    -- Raw AI response for debugging
    ai_raw_response JSONB,

    -- =========================================================================
    -- METADATA
    -- =========================================================================
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',

    -- Phone system metadata
    phone_system VARCHAR(50), -- twilio, ringcentral, etc.
    phone_system_metadata JSONB,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update leads and deals with call FK
ALTER TABLE leads ADD CONSTRAINT fk_leads_initial_call
    FOREIGN KEY (initial_call_id) REFERENCES calls(id);

ALTER TABLE deals ADD CONSTRAINT fk_deals_source_call
    FOREIGN KEY (source_call_id) REFERENCES calls(id);

-- Indexes for calls
CREATE INDEX idx_calls_user ON calls(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_lead ON calls(lead_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_contact ON calls(contact_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_deal ON calls(deal_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_campaign ON calls(campaign_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_started ON calls(started_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_direction ON calls(direction) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_disposition ON calls(disposition) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_external ON calls(external_call_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_tracking_number ON calls(tracking_number) WHERE is_deleted = FALSE;

-- Phone number lookups
CREATE INDEX idx_calls_from ON calls(from_number) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_to ON calls(to_number) WHERE is_deleted = FALSE;

-- AI analysis queue
CREATE INDEX idx_calls_ai_pending ON calls(ai_analysis_status, created_at)
    WHERE is_deleted = FALSE AND ai_analysis_status = 'pending' AND recording_url IS NOT NULL;

-- Duration-based queries
CREATE INDEX idx_calls_duration ON calls(duration_seconds DESC)
    WHERE is_deleted = FALSE AND duration_seconds > 0;

-- Composite indexes for common queries
CREATE INDEX idx_calls_user_started ON calls(user_id, started_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_calls_lead_started ON calls(lead_id, started_at DESC) WHERE is_deleted = FALSE;

-- ============================================================================
-- FORM SUBMISSIONS (Web forms, landing pages)
-- ============================================================================

CREATE TABLE form_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Form identification
    form_id VARCHAR(100), -- Your form's unique ID
    form_name VARCHAR(200),
    form_url TEXT,

    -- Submitter info (raw from form)
    submitted_first_name VARCHAR(100),
    submitted_last_name VARCHAR(100),
    submitted_email VARCHAR(255),
    submitted_phone VARCHAR(20),
    submitted_message TEXT,

    -- All form fields (flexible storage)
    form_data JSONB NOT NULL DEFAULT '{}',

    -- Source tracking
    campaign_id UUID REFERENCES campaigns(id),
    source_type lead_source_type DEFAULT 'web_form',
    referrer_url TEXT,
    landing_page_url TEXT,

    -- UTM parameters
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_content VARCHAR(100),
    utm_term VARCHAR(100),

    -- Visitor tracking
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(200),
    visitor_id VARCHAR(200), -- Persistent visitor ID if available

    -- Geographic data (from IP)
    geo_city VARCHAR(100),
    geo_state VARCHAR(50),
    geo_country VARCHAR(50),
    geo_timezone VARCHAR(50),

    -- Processing status
    is_processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES users(id),

    -- Resulting records
    lead_id UUID REFERENCES leads(id),
    contact_id UUID REFERENCES contacts(id),
    deal_id UUID REFERENCES deals(id),

    -- Ownership
    assigned_to UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ,

    -- Duplicate detection
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of_lead_id UUID REFERENCES leads(id),
    duplicate_of_contact_id UUID REFERENCES contacts(id),

    -- Spam detection
    is_spam BOOLEAN DEFAULT FALSE,
    spam_score DECIMAL(5,2),
    spam_reason VARCHAR(200),

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for form submissions
CREATE INDEX idx_form_submissions_form ON form_submissions(form_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_form_submissions_campaign ON form_submissions(campaign_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_form_submissions_email ON form_submissions(submitted_email) WHERE is_deleted = FALSE;
CREATE INDEX idx_form_submissions_phone ON form_submissions(submitted_phone) WHERE is_deleted = FALSE;
CREATE INDEX idx_form_submissions_created ON form_submissions(created_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_form_submissions_lead ON form_submissions(lead_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_form_submissions_assigned ON form_submissions(assigned_to) WHERE is_deleted = FALSE;

-- Unprocessed queue
CREATE INDEX idx_form_submissions_unprocessed ON form_submissions(created_at)
    WHERE is_deleted = FALSE AND is_processed = FALSE AND is_spam = FALSE;

-- ============================================================================
-- CALL TAGS (Flexible tagging for calls)
-- ============================================================================

CREATE TABLE call_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#808080', -- Hex color
    description TEXT,

    -- Category for grouping
    category VARCHAR(50),

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default call tags
INSERT INTO call_tags (name, color, category) VALUES
    ('Hot Lead', '#FF4136', 'qualification'),
    ('Cold Lead', '#0074D9', 'qualification'),
    ('Callback Requested', '#FF851B', 'action'),
    ('Needs Follow-up', '#FFDC00', 'action'),
    ('Ready to Buy', '#2ECC40', 'status'),
    ('Price Shopper', '#B10DC9', 'objection'),
    ('Referred by Friend', '#01FF70', 'source'),
    ('High Net Worth', '#39CCCC', 'qualification'),
    ('Existing Customer', '#85144b', 'status'),
    ('Competitor Mentioned', '#F012BE', 'competitive');

CREATE TABLE call_tag_assignments (
    call_id UUID NOT NULL REFERENCES calls(id),
    tag_id UUID NOT NULL REFERENCES call_tags(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (call_id, tag_id)
);

CREATE INDEX idx_call_tag_assignments_call ON call_tag_assignments(call_id);
CREATE INDEX idx_call_tag_assignments_tag ON call_tag_assignments(tag_id);

COMMENT ON TABLE calls IS 'Every phone call is stored as a first-class record with full attribution';
COMMENT ON TABLE form_submissions IS 'Web form submissions with full UTM tracking and duplicate detection';
COMMENT ON COLUMN calls.ai_analysis_status IS 'Status of AI transcription/analysis for this call';
