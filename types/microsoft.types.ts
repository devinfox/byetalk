// Microsoft OAuth and Graph API Types

// ============================================================================
// ENUMS
// ============================================================================

export type EmailProviderType = 'sendgrid' | 'microsoft' | 'gmail'

export type MicrosoftSyncStatus = 'started' | 'completed' | 'failed'

export type MicrosoftSyncType = 'full' | 'delta' | 'webhook'

// ============================================================================
// ORGANIZATION
// ============================================================================

export interface Organization {
  id: string
  domain: string
  name: string | null
  microsoft_tenant_id: string | null
  allow_microsoft_login: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// MICROSOFT OAUTH
// ============================================================================

export interface MicrosoftOAuthTokens {
  id: string
  user_id: string
  email: string
  microsoft_user_id: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  scopes: string[]
  mail_delta_token: string | null
  last_sync_at: string | null
  sync_enabled: boolean
  initial_sync_completed: boolean
  webhook_subscription_id: string | null
  webhook_expiration: string | null
  created_at: string
  updated_at: string
}

export interface MicrosoftTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
  id_token?: string
}

export interface MicrosoftUserProfile {
  id: string
  displayName: string
  givenName: string
  surname: string
  mail: string
  userPrincipalName: string
  jobTitle?: string
  officeLocation?: string
  mobilePhone?: string
  businessPhones?: string[]
}

// ============================================================================
// MICROSOFT SYNC LOG
// ============================================================================

export interface MicrosoftSyncLog {
  id: string
  token_id: string
  sync_type: MicrosoftSyncType
  messages_synced: number
  messages_created: number
  messages_updated: number
  status: MicrosoftSyncStatus
  error_message: string | null
  delta_token_before: string | null
  delta_token_after: string | null
  started_at: string
  completed_at: string | null
}

// ============================================================================
// MICROSOFT GRAPH API TYPES
// ============================================================================

export interface GraphEmailAddress {
  address: string
  name?: string
}

export interface GraphRecipient {
  emailAddress: GraphEmailAddress
}

export interface GraphItemBody {
  contentType: 'text' | 'html'
  content: string
}

export interface GraphAttachment {
  '@odata.type': string
  id?: string
  name: string
  contentType: string
  size: number
  isInline: boolean
  contentId?: string
  contentBytes?: string // Base64 encoded
}

export interface GraphMessage {
  id: string
  createdDateTime: string
  lastModifiedDateTime: string
  receivedDateTime: string
  sentDateTime: string | null
  hasAttachments: boolean
  internetMessageId: string
  subject: string
  bodyPreview: string
  importance: 'low' | 'normal' | 'high'
  parentFolderId: string
  conversationId: string
  conversationIndex: string
  isDeliveryReceiptRequested: boolean
  isReadReceiptRequested: boolean
  isRead: boolean
  isDraft: boolean
  webLink: string
  inferenceClassification: 'focused' | 'other'
  body: GraphItemBody
  sender: GraphRecipient
  from: GraphRecipient
  toRecipients: GraphRecipient[]
  ccRecipients: GraphRecipient[]
  bccRecipients: GraphRecipient[]
  replyTo: GraphRecipient[]
  flag: {
    flagStatus: 'notFlagged' | 'flagged' | 'complete'
  }
  attachments?: GraphAttachment[]
}

export interface GraphMessageList {
  '@odata.context': string
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
  value: GraphMessage[]
}

export interface GraphMailFolder {
  id: string
  displayName: string
  parentFolderId: string | null
  childFolderCount: number
  unreadItemCount: number
  totalItemCount: number
  isHidden: boolean
}

export interface GraphMailFolderList {
  '@odata.context': string
  value: GraphMailFolder[]
}

export interface GraphSubscription {
  id: string
  changeType: string
  clientState: string
  notificationUrl: string
  expirationDateTime: string
  resource: string
  applicationId: string
}

export interface GraphWebhookNotification {
  value: Array<{
    subscriptionId: string
    clientState: string
    changeType: 'created' | 'updated' | 'deleted'
    resource: string
    subscriptionExpirationDateTime: string
    resourceData: {
      '@odata.type': string
      '@odata.id': string
      '@odata.etag': string
      id: string
    }
    tenantId: string
  }>
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface SendMicrosoftEmailRequest {
  to: GraphRecipient[]
  cc?: GraphRecipient[]
  bcc?: GraphRecipient[]
  subject: string
  body: GraphItemBody
  attachments?: Array<{
    name: string
    contentType: string
    contentBytes: string // Base64
  }>
  saveToSentItems?: boolean
  replyTo?: string // Message ID to reply to
}

export interface MicrosoftSyncRequest {
  tokenId: string
  fullSync?: boolean
}

export interface MicrosoftSyncResult {
  success: boolean
  messagesProcessed: number
  messagesCreated: number
  messagesUpdated: number
  newDeltaToken?: string
  error?: string
}

// ============================================================================
// AUTH STATE
// ============================================================================

export interface MicrosoftAuthState {
  email: string
  redirect: string
  nonce: string
  timestamp: number
}

// ============================================================================
// EXTENDED EMAIL ACCOUNT (with Microsoft fields)
// ============================================================================

export interface EmailAccountWithMicrosoft {
  id: string
  email_address: string
  display_name: string | null
  domain_id: string | null
  user_id: string
  is_primary: boolean
  is_active: boolean
  provider: EmailProviderType
  microsoft_token_id: string | null
  signature_html: string | null
  signature_text: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  // Joined
  microsoft_token?: MicrosoftOAuthTokens
}

// ============================================================================
// EXTENDED EMAIL (with Microsoft fields)
// ============================================================================

export interface EmailWithMicrosoft {
  id: string
  email_provider: EmailProviderType
  graph_message_id: string | null
  graph_conversation_id: string | null
  graph_internet_message_id: string | null
  // ... other email fields from email.types.ts
}
