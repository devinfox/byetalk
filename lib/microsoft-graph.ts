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

  console.log('[Microsoft Graph] Sending email with attachments:', payload.message.attachments?.length || 0)
  if (payload.message.attachments?.length > 0) {
    payload.message.attachments.forEach((att: any, idx: number) => {
      console.log(`[Microsoft Graph] Attachment ${idx + 1}:`, {
        odataType: att['@odata.type'],
        name: att.name,
        contentType: att.contentType,
        hasContentBytes: !!att.contentBytes,
        contentBytesLength: att.contentBytes?.length || 0,
        contentBytesPreview: att.contentBytes?.substring(0, 50) + '...',
      })
    })
  }

  // Log the full payload structure (without full content for brevity)
  console.log('[Microsoft Graph] Full payload structure:', {
    subject: payload.message.subject,
    bodyContentType: payload.message.body?.contentType,
    toRecipients: payload.message.toRecipients?.length,
    attachmentsCount: payload.message.attachments?.length || 0,
    saveToSentItems: payload.saveToSentItems,
  })

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
    console.error('[Microsoft Graph] Send email error:', JSON.stringify(error, null, 2))
    throw new Error(error.error?.message || 'Failed to send email')
  }

  // Log success with response details
  const responseText = response.status === 202 ? 'Accepted' : await response.text().catch(() => 'No response body')
  console.log('[Microsoft Graph] Email sent successfully, status:', response.status, 'response:', responseText)
}

/**
 * Send an email with large attachments using upload sessions
 * This is required for attachments over 3MB
 */
export async function sendEmailWithLargeAttachments(
  accessToken: string,
  message: {
    to: GraphRecipient[]
    cc?: GraphRecipient[]
    bcc?: GraphRecipient[]
    subject: string
    body: GraphItemBody
  },
  attachments: Array<{
    name: string
    contentType: string
    contentBytes: string // base64 encoded
    size: number
  }>
): Promise<void> {
  // Step 1: Create a draft message
  const draftResponse = await fetch(`${GRAPH_BASE_URL}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: message.subject,
      body: message.body,
      toRecipients: message.to,
      ccRecipients: message.cc || [],
      bccRecipients: message.bcc || [],
    }),
  })

  if (!draftResponse.ok) {
    const error = await draftResponse.json()
    throw new Error(error.error?.message || 'Failed to create draft message')
  }

  const draft = await draftResponse.json()
  const messageId = draft.id

  try {
    // Step 2: Upload each attachment
    for (const attachment of attachments) {
      const fileBytes = Buffer.from(attachment.contentBytes, 'base64')
      const fileSize = fileBytes.length

      if (fileSize <= 3 * 1024 * 1024) {
        // Small attachment - add directly
        const addAttResponse = await fetch(
          `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: attachment.name,
              contentType: attachment.contentType,
              contentBytes: attachment.contentBytes,
            }),
          }
        )

        if (!addAttResponse.ok) {
          const error = await addAttResponse.json()
          throw new Error(error.error?.message || `Failed to add attachment: ${attachment.name}`)
        }
      } else {
        // Large attachment - use upload session
        // Step 2a: Create upload session
        const sessionResponse = await fetch(
          `${GRAPH_BASE_URL}/me/messages/${messageId}/attachments/createUploadSession`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              AttachmentItem: {
                attachmentType: 'file',
                name: attachment.name,
                size: fileSize,
                contentType: attachment.contentType,
              },
            }),
          }
        )

        if (!sessionResponse.ok) {
          const error = await sessionResponse.json()
          throw new Error(error.error?.message || `Failed to create upload session for: ${attachment.name}`)
        }

        const session = await sessionResponse.json()
        const uploadUrl = session.uploadUrl

        // Step 2b: Upload file in chunks (4MB chunks)
        const chunkSize = 4 * 1024 * 1024 // 4MB
        let offset = 0

        while (offset < fileSize) {
          const end = Math.min(offset + chunkSize, fileSize)
          const chunk = fileBytes.slice(offset, end)

          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': chunk.length.toString(),
              'Content-Range': `bytes ${offset}-${end - 1}/${fileSize}`,
            },
            body: chunk,
          })

          if (!uploadResponse.ok && uploadResponse.status !== 201 && uploadResponse.status !== 200) {
            const error = await uploadResponse.text()
            throw new Error(`Failed to upload chunk for: ${attachment.name}. Error: ${error}`)
          }

          offset = end
        }
      }
    }

    // Step 3: Send the message
    const sendResponse = await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!sendResponse.ok) {
      const error = await sendResponse.json()
      throw new Error(error.error?.message || 'Failed to send email with attachments')
    }
  } catch (error) {
    // Clean up: delete the draft if sending failed
    try {
      await fetch(`${GRAPH_BASE_URL}/me/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    } catch {
      // Ignore cleanup errors
    }
    throw error
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
