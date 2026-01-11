// Microsoft Graph API Library
// Handles email operations via Microsoft Graph API

import {
  GraphMessage,
  GraphMessageList,
  GraphMailFolder,
  GraphMailFolderList,
  GraphSubscription,
  GraphRecipient,
  GraphItemBody,
  MicrosoftSyncResult,
} from '@/types/microsoft.types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

// ============================================================================
// EMAIL OPERATIONS
// ============================================================================

/**
 * List emails from a folder (default: inbox)
 */
export async function listEmails(
  accessToken: string,
  options: {
    folderId?: string
    top?: number
    skip?: number
    filter?: string
    orderBy?: string
    select?: string[]
  } = {}
): Promise<GraphMessageList> {
  const {
    folderId = 'inbox',
    top = 50,
    skip = 0,
    filter,
    orderBy = 'receivedDateTime desc',
    select = [
      'id',
      'createdDateTime',
      'lastModifiedDateTime',
      'receivedDateTime',
      'sentDateTime',
      'hasAttachments',
      'internetMessageId',
      'subject',
      'bodyPreview',
      'importance',
      'parentFolderId',
      'conversationId',
      'isRead',
      'isDraft',
      'webLink',
      'body',
      'sender',
      'from',
      'toRecipients',
      'ccRecipients',
      'bccRecipients',
      'flag',
    ],
  } = options

  const params = new URLSearchParams({
    $top: top.toString(),
    $skip: skip.toString(),
    $orderby: orderBy,
    $select: select.join(','),
  })

  if (filter) {
    params.set('$filter', filter)
  }

  const response = await fetch(
    `${GRAPH_BASE_URL}/me/mailFolders/${folderId}/messages?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to list emails')
  }

  return response.json()
}

/**
 * List emails with delta query for incremental sync
 */
export async function listEmailsDelta(
  accessToken: string,
  options: {
    folderId?: string
    deltaToken?: string
    select?: string[]
  } = {}
): Promise<GraphMessageList & { '@odata.deltaLink'?: string }> {
  const {
    folderId = 'inbox',
    deltaToken,
    select = [
      'id',
      'createdDateTime',
      'lastModifiedDateTime',
      'receivedDateTime',
      'sentDateTime',
      'hasAttachments',
      'internetMessageId',
      'subject',
      'bodyPreview',
      'importance',
      'parentFolderId',
      'conversationId',
      'isRead',
      'isDraft',
      'webLink',
      'body',
      'sender',
      'from',
      'toRecipients',
      'ccRecipients',
      'bccRecipients',
      'flag',
    ],
  } = options

  let url: string

  if (deltaToken) {
    // Use delta token for incremental sync
    url = deltaToken
  } else {
    // Initial delta query
    const params = new URLSearchParams({
      $select: select.join(','),
    })
    url = `${GRAPH_BASE_URL}/me/mailFolders/${folderId}/messages/delta?${params.toString()}`
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to sync emails')
  }

  return response.json()
}

/**
 * Get a single email by ID
 */
export async function getEmail(accessToken: string, messageId: string): Promise<GraphMessage> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to get email')
  }

  return response.json()
}

/**
 * Get email with attachments
 */
export async function getEmailWithAttachments(
  accessToken: string,
  messageId: string
): Promise<GraphMessage> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}?$expand=attachments`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to get email with attachments')
  }

  return response.json()
}

/**
 * Send an email via Graph API
 */
export async function sendEmail(
  accessToken: string,
  message: {
    to: GraphRecipient[]
    cc?: GraphRecipient[]
    bcc?: GraphRecipient[]
    subject: string
    body: GraphItemBody
    attachments?: Array<{
      '@odata.type': string
      name: string
      contentType: string
      contentBytes: string
    }>
    saveToSentItems?: boolean
  }
): Promise<void> {
  const payload = {
    message: {
      subject: message.subject,
      body: message.body,
      toRecipients: message.to,
      ccRecipients: message.cc || [],
      bccRecipients: message.bcc || [],
      attachments: message.attachments || [],
    },
    saveToSentItems: message.saveToSentItems !== false,
  }

  const response = await fetch(`${GRAPH_BASE_URL}/me/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to send email')
  }
}

/**
 * Reply to an email
 */
export async function replyToEmail(
  accessToken: string,
  messageId: string,
  comment: string,
  replyAll: boolean = false
): Promise<void> {
  const endpoint = replyAll ? 'replyAll' : 'reply'

  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to reply to email')
  }
}

/**
 * Forward an email
 */
export async function forwardEmail(
  accessToken: string,
  messageId: string,
  toRecipients: GraphRecipient[],
  comment?: string
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}/forward`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      comment: comment || '',
      toRecipients,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to forward email')
  }
}

/**
 * Mark email as read/unread
 */
export async function updateEmailReadStatus(
  accessToken: string,
  messageId: string,
  isRead: boolean
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isRead }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to update email read status')
  }
}

/**
 * Move email to folder
 */
export async function moveEmail(
  accessToken: string,
  messageId: string,
  destinationFolderId: string
): Promise<GraphMessage> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}/move`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destinationId: destinationFolderId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to move email')
  }

  return response.json()
}

/**
 * Delete email (move to deleted items)
 */
export async function deleteEmail(accessToken: string, messageId: string): Promise<void> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to delete email')
  }
}

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/**
 * List mail folders
 */
export async function listMailFolders(accessToken: string): Promise<GraphMailFolderList> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/mailFolders`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to list mail folders')
  }

  return response.json()
}

/**
 * Get folder by well-known name
 */
export async function getMailFolder(
  accessToken: string,
  folderName: string
): Promise<GraphMailFolder> {
  const response = await fetch(`${GRAPH_BASE_URL}/me/mailFolders/${folderName}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to get mail folder')
  }

  return response.json()
}

// ============================================================================
// WEBHOOK SUBSCRIPTIONS
// ============================================================================

/**
 * Create a webhook subscription for new emails
 */
export async function createMailSubscription(
  accessToken: string,
  webhookUrl: string,
  clientState: string,
  expirationMinutes: number = 4230 // Max is 4230 minutes (~3 days)
): Promise<GraphSubscription> {
  const expirationDateTime = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()

  const response = await fetch(`${GRAPH_BASE_URL}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changeType: 'created,updated',
      notificationUrl: webhookUrl,
      resource: 'me/mailFolders(\'inbox\')/messages',
      expirationDateTime,
      clientState,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to create subscription')
  }

  return response.json()
}

/**
 * Renew a webhook subscription
 */
export async function renewMailSubscription(
  accessToken: string,
  subscriptionId: string,
  expirationMinutes: number = 4230
): Promise<GraphSubscription> {
  const expirationDateTime = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString()

  const response = await fetch(`${GRAPH_BASE_URL}/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expirationDateTime }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to renew subscription')
  }

  return response.json()
}

/**
 * Delete a webhook subscription
 */
export async function deleteMailSubscription(
  accessToken: string,
  subscriptionId: string
): Promise<void> {
  const response = await fetch(`${GRAPH_BASE_URL}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to delete subscription')
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Maps Graph folder names to our email folder types
 */
export function mapGraphFolderToEmailFolder(
  graphFolderName: string
): 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' {
  const mapping: Record<string, 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'> = {
    inbox: 'inbox',
    sentitems: 'sent',
    drafts: 'drafts',
    deleteditems: 'trash',
    junkemail: 'spam',
    archive: 'archive',
  }

  return mapping[graphFolderName.toLowerCase()] || 'inbox'
}

/**
 * Extracts email address from Graph recipient
 */
export function extractEmailFromRecipient(recipient: GraphRecipient): {
  email: string
  name?: string
} {
  return {
    email: recipient.emailAddress.address,
    name: recipient.emailAddress.name,
  }
}

/**
 * Creates Graph recipient from email address
 */
export function createRecipient(email: string, name?: string): GraphRecipient {
  return {
    emailAddress: {
      address: email,
      name: name || email,
    },
  }
}

/**
 * Performs a full email sync (all pages)
 */
export async function syncAllEmails(
  accessToken: string,
  folderId: string = 'inbox',
  onProgress?: (count: number) => void
): Promise<MicrosoftSyncResult> {
  const result: MicrosoftSyncResult = {
    success: true,
    messagesProcessed: 0,
    messagesCreated: 0,
    messagesUpdated: 0,
  }

  try {
    let deltaLink: string | undefined
    let messages: GraphMessage[] = []

    // Initial delta query
    let response = await listEmailsDelta(accessToken, { folderId })
    messages = [...messages, ...response.value]

    // Follow @odata.nextLink for pagination
    while (response['@odata.nextLink']) {
      response = await listEmailsDelta(accessToken, { deltaToken: response['@odata.nextLink'] })
      messages = [...messages, ...response.value]
      onProgress?.(messages.length)
    }

    // Store the delta link for next sync
    deltaLink = response['@odata.deltaLink']

    result.messagesProcessed = messages.length
    result.newDeltaToken = deltaLink

    return result
  } catch (error) {
    result.success = false
    result.error = (error as Error).message
    return result
  }
}
