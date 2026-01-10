// Email System Types

// Enums
export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'

export type EmailStatus =
  | 'draft'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'failed'
  | 'spam_reported'

export type DomainVerificationStatus = 'pending' | 'verifying' | 'verified' | 'failed'

// DNS Record types
export interface DNSRecord {
  type: 'mx' | 'txt' | 'cname' | 'dkim'
  host: string
  value: string
  priority?: number
  verified: boolean
}

// Email participant (to, cc, bcc)
export interface EmailParticipant {
  email: string
  name?: string
}

// Email Domain
export interface EmailDomain {
  id: string
  domain: string
  sendgrid_domain_id: string | null
  sendgrid_authenticated: boolean
  verification_status: DomainVerificationStatus
  verified_at: string | null
  last_verification_check: string | null
  verification_error: string | null
  dns_records: DNSRecord[]
  inbound_enabled: boolean
  created_by: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// Email Account
export interface EmailAccount {
  id: string
  email_address: string
  display_name: string | null
  domain_id: string | null
  user_id: string
  is_primary: boolean
  is_active: boolean
  signature_html: string | null
  signature_text: string | null
  auto_reply_enabled: boolean
  auto_reply_subject: string | null
  auto_reply_body: string | null
  auto_reply_start: string | null
  auto_reply_end: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Joined
  email_domain?: EmailDomain
}

// Email Thread
export interface EmailThread {
  id: string
  subject: string | null
  participants: EmailParticipant[]
  last_message_at: string
  message_count: number
  unread_count: number
  has_attachments: boolean
  is_starred: boolean
  is_read: boolean
  folder: EmailFolder
  labels: string[]
  email_account_id: string
  contact_id: string | null
  lead_id: string | null
  deal_id: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Joined
  email_account?: EmailAccount
  emails?: Email[]
  latest_email?: Email
}

// Email Message
export interface Email {
  id: string
  thread_id: string | null
  message_id: string | null
  in_reply_to: string | null
  references_header: string[] | null
  from_address: string
  from_name: string | null
  to_addresses: EmailParticipant[]
  cc_addresses: EmailParticipant[]
  bcc_addresses: EmailParticipant[]
  reply_to_address: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  snippet: string | null
  is_inbound: boolean
  status: EmailStatus
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  open_count: number
  click_count: number
  sendgrid_message_id: string | null
  has_attachments: boolean
  is_read: boolean
  read_at: string | null
  is_starred: boolean
  email_account_id: string
  headers: Record<string, string> | null
  scheduled_at: string | null
  contact_id: string | null
  lead_id: string | null
  deal_id: string | null
  email_template_id: string | null
  is_deleted: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Joined
  attachments?: EmailAttachment[]
  thread?: EmailThread
}

// Email Attachment
export interface EmailAttachment {
  id: string
  email_id: string
  filename: string
  content_type: string | null
  size_bytes: number | null
  storage_bucket: string
  storage_path: string
  public_url: string | null
  content_id: string | null
  is_inline: boolean
  created_at: string
}

// Email Event (webhook tracking)
export interface EmailEvent {
  id: string
  email_id: string | null
  sendgrid_message_id: string | null
  event_type: string
  event_timestamp: string
  recipient: string | null
  url: string | null
  user_agent: string | null
  ip_address: string | null
  bounce_type: string | null
  bounce_reason: string | null
  raw_payload: Record<string, unknown> | null
  created_at: string
}

// Folder counts view
export interface EmailFolderCount {
  email_account_id: string
  user_id: string
  folder: EmailFolder
  total_count: number
  unread_count: number
}

// API Request/Response Types

export interface SendEmailRequest {
  emailAccountId: string
  to: EmailParticipant[]
  cc?: EmailParticipant[]
  bcc?: EmailParticipant[]
  subject: string
  bodyHtml: string
  bodyText?: string
  replyToEmailId?: string
  threadId?: string
  attachmentIds?: string[]
  scheduledAt?: string
  contactId?: string
  leadId?: string
  dealId?: string
  templateId?: string
}

export interface SendEmailResponse {
  success: boolean
  emailId: string
  messageId?: string
  scheduled?: boolean
  error?: string
}

export interface CreateDomainRequest {
  domain: string
}

export interface CreateDomainResponse {
  success: boolean
  domain: EmailDomain
  dnsRecords: DNSRecord[]
  error?: string
}

export interface VerifyDomainResponse {
  success: boolean
  verified: boolean
  records: DNSRecord[]
  error?: string
}

export interface CreateEmailAccountRequest {
  emailAddress: string
  displayName?: string
  domainId: string
  isPrimary?: boolean
  signatureHtml?: string
}

export interface UploadAttachmentResponse {
  success: boolean
  attachment: EmailAttachment
  error?: string
}

// Search
export interface EmailSearchParams {
  query?: string
  folder?: EmailFolder
  isStarred?: boolean
  isRead?: boolean
  hasAttachments?: boolean
  from?: string
  to?: string
  dateFrom?: string
  dateTo?: string
  contactId?: string
  leadId?: string
  dealId?: string
  limit?: number
  offset?: number
}

export interface EmailSearchResult {
  threads: EmailThread[]
  total: number
  hasMore: boolean
}

// Compose state
export interface ComposeEmailState {
  to: EmailParticipant[]
  cc: EmailParticipant[]
  bcc: EmailParticipant[]
  subject: string
  bodyHtml: string
  bodyText: string
  attachments: File[]
  replyToEmail?: Email
  forwardEmail?: Email
  threadId?: string
  isDraft: boolean
  draftId?: string
}
