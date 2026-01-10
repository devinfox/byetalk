/**
 * Gold IRA CRM - Database Types
 * Auto-generate with: npx supabase gen types typescript --project-id YOUR_PROJECT_ID
 * This file provides TypeScript types for the database schema
 */

// ============================================================================
// ENUMS
// ============================================================================

export type UserRole =
  | 'sales_rep'
  | 'senior_rep'
  | 'closer'
  | 'manager'
  | 'admin'
  | 'super_admin';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'unqualified'
  | 'converted'
  | 'dead';

export type LeadSourceType =
  | 'ppc'
  | 'organic'
  | 'referral'
  | 'radio'
  | 'tv'
  | 'direct_mail'
  | 'inbound_call'
  | 'outbound_call'
  | 'web_form'
  | 'trade_show'
  | 'partner'
  | 'other';

export type DealStage =
  | 'deal_opened'
  | 'proposal_education'
  | 'paperwork_sent'
  | 'paperwork_complete'
  | 'funding_in_progress'
  | 'closed_won'
  | 'closed_lost';

export type DealType =
  | 'new_ira'
  | 'ira_rollover'
  | 'ira_transfer'
  | 'cash_purchase'
  | 'additional_investment'
  | 'liquidation';

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'metal_purchase'
  | 'metal_sale'
  | 'fee'
  | 'adjustment'
  | 'commission_payout';

export type CallDirection = 'inbound' | 'outbound';

export type CallDisposition =
  | 'answered'
  | 'voicemail'
  | 'no_answer'
  | 'busy'
  | 'wrong_number'
  | 'disconnected'
  | 'callback_scheduled'
  | 'not_interested'
  | 'do_not_call';

export type CommissionType =
  | 'base'
  | 'bonus'
  | 'override'
  | 'split'
  | 'clawback';

export type EventType =
  | 'deal_created'
  | 'deal_updated'
  | 'deal_stage_changed'
  | 'deal_owner_changed'
  | 'deal_closed_won'
  | 'deal_closed_lost'
  | 'lead_created'
  | 'lead_converted'
  | 'contact_created'
  | 'call_logged'
  | 'form_submitted'
  | 'funding_received'
  | 'metals_purchased'
  | 'commission_calculated'
  | 'turnover_initiated'
  | 'turnover_completed'
  | 'note_added'
  | 'document_uploaded'
  | 'email_sent'
  | 'task_created'
  | 'task_completed';

export type TurnoverReason =
  | 'expertise_needed'
  | 'language_preference'
  | 'customer_request'
  | 'manager_decision'
  | 'rep_unavailable'
  | 'territory_transfer'
  | 'closing_specialist'
  | 'account_management';

export type AIAnalysisStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface User {
  id: string;
  auth_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  gladiator_avatar: string | null;
  role: UserRole;
  team_id: string | null;
  reports_to: string | null;
  hire_date: string | null;
  employee_id: string | null;
  is_active: boolean;
  base_commission_rate: number;
  override_commission_rate: number;
  assignment_weight: number;
  is_available_for_assignment: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  parent_team_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  source_type: LeadSourceType;
  tracking_phone: string | null;
  tracking_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  budget_amount: number | null;
  cost_per_lead: number | null;
  assigned_team_id: string | null;
  assigned_user_id: string | null;
  use_round_robin: boolean;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  status: LeadStatus;
  score: number;
  source_type: LeadSourceType | null;
  campaign_id: string | null;
  referral_source: string | null;
  landing_page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  initial_call_id: string | null;
  owner_id: string | null;
  assigned_at: string | null;
  converted_at: string | null;
  converted_deal_id: string | null;
  converted_contact_id: string | null;
  notes: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // AI-generated profile fields
  ai_profile_summary: string | null;
  ai_profile_details: {
    demographics?: {
      estimated_age?: string;
      location?: string;
      occupation?: string;
      family_situation?: string;
    };
    financial_profile?: {
      investment_capacity?: string;
      current_holdings?: string;
      purchase_history?: string[];
      investment_timeline?: string;
      retirement_timeline?: string;
      financial_concerns?: string;
    };
    psychological_profile?: {
      decision_making_style?: string;
      trust_level?: string;
      fear_factors?: string[];
      desire_factors?: string[];
      buying_triggers?: string[];
      resistance_patterns?: string[];
    };
    communication_insights?: {
      preferred_style?: string;
      hot_buttons?: string[];
      cold_buttons?: string[];
      pace_preference?: string;
      best_contact_times?: string;
    };
    relationship_status?: {
      rapport_level?: string;
      trust_built?: string;
      objections_overcome?: string[];
      objections_remaining?: string[];
      next_milestone?: string;
    };
    personality_traits?: string[];
    interests_and_motivations?: string[];
    concerns_and_objections?: string[];
    communication_style?: string;
    best_contact_times?: string;
    relationship_stage?: string;
    key_notes?: string[];
    key_intelligence?: string[];
    overall_assessment?: string;
    evolution_notes?: string;
    call_count?: number;
    email_count?: number;
    total_talk_time_minutes?: number;
  } | null;
  ai_coaching_tips: string[] | null;
  ai_profile_updated_at: string | null;
  ai_tags: Array<{
    label: string;
    category: 'investment' | 'budget' | 'personality' | 'situation' | 'relationship' | 'motivation' | 'timeline';
  }> | null;
}

export interface Contact {
  id: string;
  lead_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  date_of_birth: string | null;
  ssn_last_four: string | null;
  employer: string | null;
  occupation: string | null;
  preferred_contact_method: string;
  best_time_to_call: string | null;
  timezone: string | null;
  is_accredited_investor: boolean | null;
  annual_income_range: string | null;
  net_worth_range: string | null;
  investment_experience: string | null;
  spouse_name: string | null;
  beneficiary_info: Record<string, unknown> | null;
  owner_id: string | null;
  notes: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  deal_number: number;
  name: string;
  deal_type: DealType;
  stage: DealStage;
  stage_entered_at: string;
  contact_id: string | null;
  lead_id: string | null;
  owner_id: string;
  assigned_at: string;
  secondary_owner_id: string | null;
  secondary_owner_split: number;
  original_owner_id: string | null;

  // Monetary tracking
  estimated_value: number;
  estimated_close_date: string | null;
  funded_amount: number;
  metal_type: string | null;
  metal_weight_oz: number | null;
  metal_spot_price: number | null;
  metal_purchase_price: number | null;
  spread_amount: number;
  spread_percentage: number;
  gross_revenue: number;
  commissionable_amount: number;
  total_commission_paid: number;

  // Timestamps
  proposal_sent_at: string | null;
  agreement_signed_at: string | null;
  paperwork_submitted_at: string | null;
  custodian_approved_at: string | null;
  funds_received_at: string | null;
  metals_purchased_at: string | null;
  closed_at: string | null;
  closed_lost_at: string | null;

  // Lost tracking
  lost_reason: string | null;
  lost_reason_notes: string | null;
  competitor_lost_to: string | null;

  // Attribution
  campaign_id: string | null;
  source_type: LeadSourceType | null;
  referral_source: string | null;
  source_call_id: string | null;

  // IRA specific
  custodian_name: string | null;
  custodian_account_number: string | null;
  ira_type: string | null;
  rollover_source: string | null;
  rollover_amount: number | null;

  // Metadata
  tags: string[] | null;
  custom_fields: Record<string, unknown>;
  notes: string | null;
  priority: number;

  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealStageConfig {
  id: string;
  stage: DealStage;
  display_name: string;
  description: string | null;
  display_order: number;
  probability: number;
  is_won_stage: boolean;
  is_lost_stage: boolean;
  is_active: boolean;
  required_fields: string[];
  automation_rules: Record<string, unknown>;
  expected_days_in_stage: number | null;
  alert_after_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface DealStageHistory {
  id: string;
  deal_id: string;
  from_stage: DealStage | null;
  to_stage: DealStage;
  changed_by: string | null;
  changed_at: string;
  time_in_stage_seconds: number | null;
  reason: string | null;
  deal_value_snapshot: number | null;
  created_at: string;
}

export interface Call {
  id: string;
  external_call_id: string | null;
  call_sid: string | null;
  direction: CallDirection;
  disposition: CallDisposition | null;
  from_number: string;
  to_number: string;
  tracking_number: string | null;
  duration_seconds: number;
  ring_duration_seconds: number | null;
  hold_duration_seconds: number | null;
  talk_duration_seconds: number | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  recording_url: string | null;
  recording_duration_seconds: number | null;
  recording_status: string | null;
  voicemail_url: string | null;
  voicemail_transcription: string | null;
  user_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  campaign_id: string | null;
  source_type: LeadSourceType | null;
  outcome_notes: string | null;
  callback_scheduled_at: string | null;
  callback_notes: string | null;

  // AI Analysis
  ai_analysis_status: AIAnalysisStatus;
  ai_analyzed_at: string | null;
  transcription: string | null;
  transcription_provider: string | null;
  ai_summary: string | null;
  ai_sentiment: string | null;
  ai_sentiment_score: number | null;
  ai_intent: string | null;
  ai_objections: string[] | null;
  ai_action_items: string[] | null;
  ai_key_topics: string[] | null;
  ai_competitor_mentions: string[] | null;
  ai_lead_quality_score: number | null;
  ai_urgency_score: number | null;
  ai_close_probability: number | null;
  ai_raw_response: Record<string, unknown> | null;

  tags: string[] | null;
  custom_fields: Record<string, unknown>;
  phone_system: string | null;
  phone_system_metadata: Record<string, unknown> | null;

  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string | null;
  form_name: string | null;
  form_url: string | null;
  submitted_first_name: string | null;
  submitted_last_name: string | null;
  submitted_email: string | null;
  submitted_phone: string | null;
  submitted_message: string | null;
  form_data: Record<string, unknown>;
  campaign_id: string | null;
  source_type: LeadSourceType;
  referrer_url: string | null;
  landing_page_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  visitor_id: string | null;
  geo_city: string | null;
  geo_state: string | null;
  geo_country: string | null;
  geo_timezone: string | null;
  is_processed: boolean;
  processed_at: string | null;
  processed_by: string | null;
  lead_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  is_duplicate: boolean;
  duplicate_of_lead_id: string | null;
  duplicate_of_contact_id: string | null;
  is_spam: boolean;
  spam_score: number | null;
  spam_reason: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FundingEvent {
  id: string;
  deal_id: string;
  transaction_type: TransactionType;
  amount: number;
  description: string | null;
  metal_type: string | null;
  metal_weight_oz: number | null;
  metal_spot_price: number | null;
  metal_premium_per_oz: number | null;
  source_account: string | null;
  destination_account: string | null;
  external_transaction_id: string | null;
  wire_reference: string | null;
  check_number: string | null;
  transaction_date: string;
  posted_at: string | null;
  cleared_at: string | null;
  status: string;
  failure_reason: string | null;
  recorded_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Turnover {
  id: string;
  deal_id: string;
  from_user_id: string;
  to_user_id: string;
  reason: TurnoverReason;
  reason_notes: string | null;
  initiated_by: string;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  status: string;
  is_full_transfer: boolean;
  from_user_split_percentage: number;
  to_user_split_percentage: number;
  split_effective_at: string;
  deal_value_at_turnover: number | null;
  deal_stage_at_turnover: DealStage | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Commission {
  id: string;
  deal_id: string;
  user_id: string;
  funding_event_id: string | null;
  commission_type: CommissionType;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  split_percentage: number;
  original_commission_amount: number | null;
  override_on_user_id: string | null;
  override_level: number | null;
  clawback_reason: string | null;
  original_commission_id: string | null;
  payment_status: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  commission_period: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  notes: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  event_type: EventType;
  event_description: string | null;
  user_id: string | null;
  user_email: string | null;
  entity_type: string;
  entity_id: string;
  deal_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  call_id: string | null;
  changes: Record<string, unknown> | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SystemEvent {
  id: string;
  event_type: EventType;
  event_name: string;
  event_version: number;
  payload: Record<string, unknown>;
  deal_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  user_id: string | null;
  status: string;
  processed_at: string | null;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  webhooks_sent: unknown[];
  created_at: string;
}

export interface Note {
  id: string;
  entity_type: string;
  entity_id: string;
  deal_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  content: string;
  content_html: string | null;
  created_by: string;
  is_private: boolean;
  is_pinned: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string | null;
  entity_type: string | null;
  entity_id: string | null;
  deal_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  call_id: string | null;
  due_at: string | null;
  reminder_at: string | null;
  status: string;
  priority: number;
  completed_at: string | null;
  completed_by: string | null;
  task_type: string | null;
  source: string;
  is_recurring: boolean;
  recurrence_rule: Record<string, unknown> | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
  storage_bucket: string;
  public_url: string | null;
  entity_type: string;
  entity_id: string;
  deal_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  document_type: string | null;
  category: string | null;
  uploaded_by: string;
  description: string | null;
  tags: string[] | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EmailTemplateCategory =
  | 'welcome'
  | 'follow_up'
  | 'paperwork'
  | 'funding'
  | 'closing'
  | 'general';

export type FunnelStatus = 'draft' | 'active' | 'paused' | 'archived';

export type EnrollmentStatus = 'active' | 'completed' | 'paused' | 'cancelled' | 'pending_approval' | 'rejected';

export interface EmailFunnel {
  id: string;
  name: string;
  description: string | null;
  status: FunnelStatus;
  tags: string[];
  auto_enroll_enabled: boolean;
  total_enrolled: number;
  total_completed: number;
  total_emails_sent: number;
  total_opens: number;
  total_clicks: number;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  phases?: EmailFunnelPhase[];
  enrollments_count?: number;
}

export interface EmailFunnelPhase {
  id: string;
  funnel_id: string;
  template_id: string | null;
  phase_order: number;
  name: string | null;
  delay_days: number;
  delay_hours: number;
  emails_sent: number;
  emails_opened: number;
  emails_clicked: number;
  created_at: string;
  updated_at: string;
  // Joined data
  template?: EmailTemplate;
}

export interface EmailFunnelEnrollment {
  id: string;
  funnel_id: string;
  lead_id: string | null;
  contact_id: string | null;
  status: EnrollmentStatus;
  current_phase: number;
  enrolled_at: string;
  enrolled_by: string | null;
  last_email_sent_at: string | null;
  next_email_scheduled_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  match_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  lead?: Lead;
  contact?: Contact;
  funnel?: EmailFunnel;
}

export interface EmailFunnelLog {
  id: string;
  enrollment_id: string;
  phase_id: string;
  email_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  scheduled_for: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  body_html: string | null;
  description: string | null;
  category: EmailTemplateCategory | null;
  is_active: boolean;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// VIEW TYPES
// ============================================================================

export interface RepPerformance {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  team_id: string | null;

  // Today
  today_funded: number;
  today_revenue: number;
  today_deals_funded: number;
  today_deals_created: number;

  // Week
  week_funded: number;
  week_revenue: number;
  week_deals_funded: number;
  week_deals_created: number;

  // Month
  month_funded: number;
  month_revenue: number;
  month_deals_funded: number;
  month_deals_created: number;
  month_deals_won: number;
  month_deals_lost: number;

  // Quarter
  quarter_funded: number;
  quarter_revenue: number;

  // Year
  year_funded: number;
  year_revenue: number;
  year_deals_funded: number;

  // All time
  total_funded: number;
  total_revenue: number;
  total_deals: number;
  total_deals_won: number;
  total_deals_lost: number;

  // Calculated
  avg_deal_size: number;
  close_rate_percent: number;

  // Call stats
  month_calls: number;
  month_talk_time_seconds: number;
  month_calls_answered: number;

  // Lead stats
  month_leads_assigned: number;
  month_leads_converted: number;

  // Efficiency
  month_revenue_per_call: number;
  month_revenue_per_lead: number;
}

export interface DealPipeline {
  stage: DealStage;
  stage_name: string;
  display_order: number;
  probability: number;
  deal_count: number;
  total_estimated_value: number;
  total_funded_amount: number;
  weighted_value: number;
  avg_deal_value: number;
  avg_days_in_stage: number;
}

export interface ExecutiveDashboard {
  // Today
  today_funded: number;
  today_revenue: number;
  today_deals_created: number;

  // Week
  week_funded: number;
  week_revenue: number;

  // Month
  month_funded: number;
  month_revenue: number;
  month_deals_won: number;
  month_deals_lost: number;
  month_deals_created: number;
  month_avg_deal_size: number;

  // Last month
  last_month_funded: number;
  last_month_revenue: number;

  // Growth
  mom_revenue_growth_percent: number;

  // Quarter
  quarter_funded: number;
  quarter_revenue: number;

  // Year
  year_funded: number;
  year_revenue: number;
  year_deals_won: number;

  // All time
  total_funded: number;
  total_revenue: number;
  total_deals: number;
  total_deals_won: number;
  total_deals_lost: number;
  avg_deal_size: number;
  overall_close_rate_percent: number;

  // Pipeline
  pipeline_total_value: number;
  pipeline_deal_count: number;
}

// ============================================================================
// DATABASE TYPE (for Supabase client)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Partial<User> & Pick<User, 'email' | 'first_name' | 'last_name'>;
        Update: Partial<User>;
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: Partial<Team> & Pick<Team, 'name'>;
        Update: Partial<Team>;
        Relationships: [];
      };
      campaigns: {
        Row: Campaign;
        Insert: Partial<Campaign> & Pick<Campaign, 'name' | 'source_type'>;
        Update: Partial<Campaign>;
        Relationships: [];
      };
      leads: {
        Row: Lead;
        Insert: Partial<Lead>;
        Update: Partial<Lead>;
        Relationships: [];
      };
      contacts: {
        Row: Contact;
        Insert: Partial<Contact> & Pick<Contact, 'first_name' | 'last_name'>;
        Update: Partial<Contact>;
        Relationships: [];
      };
      deals: {
        Row: Deal;
        Insert: Partial<Deal> & Pick<Deal, 'name' | 'deal_type' | 'owner_id'>;
        Update: Partial<Deal>;
        Relationships: [];
      };
      deal_stage_config: {
        Row: DealStageConfig;
        Insert: Partial<DealStageConfig>;
        Update: Partial<DealStageConfig>;
        Relationships: [];
      };
      deal_stage_history: {
        Row: DealStageHistory;
        Insert: Partial<DealStageHistory>;
        Update: Partial<DealStageHistory>;
        Relationships: [];
      };
      calls: {
        Row: Call;
        Insert: Partial<Call> & Pick<Call, 'direction' | 'from_number' | 'to_number' | 'started_at'>;
        Update: Partial<Call>;
        Relationships: [];
      };
      form_submissions: {
        Row: FormSubmission;
        Insert: Partial<FormSubmission>;
        Update: Partial<FormSubmission>;
        Relationships: [];
      };
      funding_events: {
        Row: FundingEvent;
        Insert: Partial<FundingEvent> & Pick<FundingEvent, 'deal_id' | 'transaction_type' | 'amount' | 'transaction_date'>;
        Update: Partial<FundingEvent>;
        Relationships: [];
      };
      turnovers: {
        Row: Turnover;
        Insert: Partial<Turnover> & Pick<Turnover, 'deal_id' | 'from_user_id' | 'to_user_id' | 'reason' | 'initiated_by'>;
        Update: Partial<Turnover>;
        Relationships: [];
      };
      commissions: {
        Row: Commission;
        Insert: Partial<Commission> & Pick<Commission, 'deal_id' | 'user_id' | 'commission_type' | 'base_amount' | 'commission_rate' | 'commission_amount'>;
        Update: Partial<Commission>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLog;
        Insert: Partial<ActivityLog> & Pick<ActivityLog, 'event_type' | 'entity_type' | 'entity_id'>;
        Update: Partial<ActivityLog>;
        Relationships: [];
      };
      system_events: {
        Row: SystemEvent;
        Insert: Partial<SystemEvent> & Pick<SystemEvent, 'event_type' | 'event_name' | 'payload'>;
        Update: Partial<SystemEvent>;
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: Partial<Note> & Pick<Note, 'entity_type' | 'entity_id' | 'content' | 'created_by'>;
        Update: Partial<Note>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & Pick<Task, 'title' | 'assigned_to'>;
        Update: Partial<Task>;
        Relationships: [];
      };
      documents: {
        Row: Document;
        Insert: Partial<Document> & Pick<Document, 'file_name' | 'storage_path' | 'entity_type' | 'entity_id' | 'uploaded_by'>;
        Update: Partial<Document>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & Pick<Message, 'sender_id' | 'recipient_id' | 'content'>;
        Update: Partial<Message>;
        Relationships: [];
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Partial<EmailTemplate> & Pick<EmailTemplate, 'name' | 'subject' | 'body'>;
        Update: Partial<EmailTemplate>;
        Relationships: [];
      };
    };
    Views: {
      v_rep_performance: {
        Row: RepPerformance;
      };
      v_deal_pipeline: {
        Row: DealPipeline;
      };
      v_executive_dashboard: {
        Row: ExecutiveDashboard;
      };
    };
    Functions: {
      get_current_user_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_manager_or_above: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_managed_user_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      get_managed_team_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      get_unread_message_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_unread_counts_by_sender: {
        Args: Record<string, never>;
        Returns: { sender_id: string; unread_count: number }[];
      };
    };
    Enums: {
      user_role: UserRole;
      lead_status: LeadStatus;
      lead_source_type: LeadSourceType;
      deal_stage: DealStage;
      deal_type: DealType;
      transaction_type: TransactionType;
      call_direction: CallDirection;
      call_disposition: CallDisposition;
      commission_type: CommissionType;
      event_type: EventType;
      turnover_reason: TurnoverReason;
      ai_analysis_status: AIAnalysisStatus;
    };
  };
}
