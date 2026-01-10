-- ============================================================================
-- GOLD IRA CRM - Database Schema
-- Migration 00001: Extensions and Enums
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- ============================================================================
-- ENUMS - Centralized type definitions
-- ============================================================================

-- User roles in the system
CREATE TYPE user_role AS ENUM (
    'sales_rep',
    'senior_rep',
    'closer',
    'manager',
    'admin',
    'super_admin'
);

-- Lead status
CREATE TYPE lead_status AS ENUM (
    'new',
    'contacted',
    'qualified',
    'unqualified',
    'converted',
    'dead'
);

-- Lead source categories
CREATE TYPE lead_source_type AS ENUM (
    'ppc',
    'organic',
    'referral',
    'radio',
    'tv',
    'direct_mail',
    'inbound_call',
    'outbound_call',
    'web_form',
    'trade_show',
    'partner',
    'other'
);

-- Deal stages (IRA-specific pipeline)
CREATE TYPE deal_stage AS ENUM (
    'new_opportunity',
    'initial_contact',
    'discovery',
    'proposal_sent',
    'agreement_signed',
    'paperwork_submitted',
    'custodian_approved',
    'funding_pending',
    'funds_received',
    'metals_purchased',
    'closed_won',
    'closed_lost'
);

-- Deal types for IRA business
CREATE TYPE deal_type AS ENUM (
    'new_ira',
    'ira_rollover',
    'ira_transfer',
    'cash_purchase',
    'additional_investment',
    'liquidation'
);

-- Transaction types
CREATE TYPE transaction_type AS ENUM (
    'deposit',
    'withdrawal',
    'metal_purchase',
    'metal_sale',
    'fee',
    'adjustment',
    'commission_payout'
);

-- Call directions
CREATE TYPE call_direction AS ENUM (
    'inbound',
    'outbound'
);

-- Call dispositions
CREATE TYPE call_disposition AS ENUM (
    'answered',
    'voicemail',
    'no_answer',
    'busy',
    'wrong_number',
    'disconnected',
    'callback_scheduled',
    'not_interested',
    'do_not_call'
);

-- Commission types
CREATE TYPE commission_type AS ENUM (
    'base',
    'bonus',
    'override',
    'split',
    'clawback'
);

-- Event types for audit logging
CREATE TYPE event_type AS ENUM (
    'deal_created',
    'deal_updated',
    'deal_stage_changed',
    'deal_owner_changed',
    'deal_closed_won',
    'deal_closed_lost',
    'lead_created',
    'lead_converted',
    'contact_created',
    'call_logged',
    'form_submitted',
    'funding_received',
    'metals_purchased',
    'commission_calculated',
    'turnover_initiated',
    'turnover_completed',
    'note_added',
    'document_uploaded',
    'email_sent',
    'task_created',
    'task_completed'
);

-- Turnover reason codes
CREATE TYPE turnover_reason AS ENUM (
    'expertise_needed',
    'language_preference',
    'customer_request',
    'manager_decision',
    'rep_unavailable',
    'territory_transfer',
    'closing_specialist',
    'account_management'
);

-- AI analysis status (future-proofing)
CREATE TYPE ai_analysis_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);

COMMENT ON TYPE user_role IS 'Defines user permission levels in the CRM';
COMMENT ON TYPE deal_stage IS 'IRA-specific deal pipeline stages with clear progression';
COMMENT ON TYPE deal_type IS 'Types of precious metals IRA transactions';
