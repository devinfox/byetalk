import { EmailParticipant } from '@/types/email.types'
import { v4 as uuidv4 } from 'uuid'

// ============================================================================
// Email Address Parsing
// ============================================================================

/**
 * Parse email address string into EmailParticipant
 * Handles formats like:
 * - "john@example.com"
 * - "John Doe <john@example.com>"
 * - "<john@example.com>"
 */
export function parseEmailAddress(input: string): EmailParticipant {
  const trimmed = input.trim()

  // Match "Name <email>" or "<email>" format
  const bracketMatch = trimmed.match(/^(.+)?\s*<([^>]+)>$/)
  if (bracketMatch) {
    return {
      name: bracketMatch[1]?.trim().replace(/^["']|["']$/g, '') || undefined,
      email: bracketMatch[2].trim().toLowerCase(),
    }
  }

  // Plain email address
  return {
    email: trimmed.toLowerCase(),
  }
}

/**
 * Parse multiple email addresses separated by commas or semicolons
 */
export function parseEmailAddresses(input: string): EmailParticipant[] {
  if (!input) return []

  // Split by comma or semicolon, but not within angle brackets
  const addresses: string[] = []
  let current = ''
  let inBrackets = false

  for (const char of input) {
    if (char === '<') inBrackets = true
    if (char === '>') inBrackets = false

    if ((char === ',' || char === ';') && !inBrackets) {
      if (current.trim()) addresses.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) addresses.push(current.trim())

  return addresses.map(parseEmailAddress)
}

/**
 * Format EmailParticipant to string for display
 */
export function formatEmailAddress(participant: EmailParticipant): string {
  if (participant.name) {
    return `${participant.name} <${participant.email}>`
  }
  return participant.email
}

/**
 * Format multiple participants to string
 */
export function formatEmailAddresses(participants: EmailParticipant[]): string {
  return participants.map(formatEmailAddress).join(', ')
}

// ============================================================================
// Message ID Generation
// ============================================================================

/**
 * Generate RFC 5322 compliant Message-ID
 */
export function generateMessageId(domain: string): string {
  const uniqueId = uuidv4().replace(/-/g, '')
  const timestamp = Date.now()
  return `<${timestamp}.${uniqueId}@${domain}>`
}

/**
 * Generate thread ID from message ID or subject
 */
export function generateThreadId(messageId: string): string {
  // Extract the unique part from message ID
  const match = messageId.match(/<(.+)>/)
  if (match) {
    return match[1].split('@')[0]
  }
  return uuidv4()
}

// ============================================================================
// Email Header Parsing
// ============================================================================

/**
 * Parse raw email headers into key-value object
 */
export function parseHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const lines = rawHeaders.split(/\r?\n/)

  let currentKey = ''
  let currentValue = ''

  for (const line of lines) {
    // Continuation of previous header (starts with whitespace)
    if (/^\s/.test(line) && currentKey) {
      currentValue += ' ' + line.trim()
    } else {
      // Save previous header
      if (currentKey) {
        headers[currentKey.toLowerCase()] = currentValue
      }

      // Parse new header
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        currentKey = line.substring(0, colonIndex).trim()
        currentValue = line.substring(colonIndex + 1).trim()
      }
    }
  }

  // Save last header
  if (currentKey) {
    headers[currentKey.toLowerCase()] = currentValue
  }

  return headers
}

/**
 * Extract References header as array
 */
export function parseReferences(referencesHeader: string | undefined): string[] {
  if (!referencesHeader) return []

  // References header contains space-separated message IDs
  const matches = referencesHeader.match(/<[^>]+>/g)
  return matches || []
}

// ============================================================================
// Subject Line Helpers
// ============================================================================

/**
 * Clean subject line for threading (remove Re:, Fwd:, etc.)
 */
export function cleanSubject(subject: string): string {
  return subject
    .replace(/^(Re|Fwd|Fw|RE|FW|FWD):\s*/gi, '')
    .replace(/^\[.+?\]\s*/g, '') // Remove [prefix] tags
    .trim()
}

/**
 * Add Re: prefix for reply
 */
export function replySubject(subject: string): string {
  const cleaned = cleanSubject(subject)
  return `Re: ${cleaned}`
}

/**
 * Add Fwd: prefix for forward
 */
export function forwardSubject(subject: string): string {
  const cleaned = cleanSubject(subject)
  return `Fwd: ${cleaned}`
}

// ============================================================================
// Content Helpers
// ============================================================================

/**
 * Generate snippet/preview from email body
 */
export function generateSnippet(text: string, maxLength = 200): string {
  // Remove excessive whitespace
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= maxLength) return cleaned

  // Truncate at word boundary
  const truncated = cleaned.substring(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated + '...'
}

/**
 * Strip HTML tags to get plain text
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generate quoted reply content
 */
export function generateQuotedReply(
  originalEmail: {
    from_name?: string | null
    from_address: string
    sent_at: string | null
    body_text: string | null
    body_html: string | null
  },
  isHtml = true
): string {
  const fromDisplay = originalEmail.from_name
    ? `${originalEmail.from_name} <${originalEmail.from_address}>`
    : originalEmail.from_address

  const dateStr = originalEmail.sent_at
    ? new Date(originalEmail.sent_at).toLocaleString()
    : 'Unknown date'

  if (isHtml) {
    const quotedContent = originalEmail.body_html || originalEmail.body_text || ''
    return `
      <br><br>
      <div class="gmail_quote">
        <div>On ${dateStr}, ${fromDisplay} wrote:</div>
        <blockquote style="margin: 0 0 0 0.8ex; border-left: 1px solid #ccc; padding-left: 1ex;">
          ${quotedContent}
        </blockquote>
      </div>
    `
  }

  const quotedContent = originalEmail.body_text || stripHtml(originalEmail.body_html || '')
  const quotedLines = quotedContent.split('\n').map(line => `> ${line}`).join('\n')

  return `\n\nOn ${dateStr}, ${fromDisplay} wrote:\n${quotedLines}`
}

/**
 * Generate forwarded content
 */
export function generateForwardContent(
  originalEmail: {
    from_name?: string | null
    from_address: string
    to_addresses: { email: string; name?: string }[]
    subject: string | null
    sent_at: string | null
    body_text: string | null
    body_html: string | null
  },
  isHtml = true
): string {
  const fromDisplay = originalEmail.from_name
    ? `${originalEmail.from_name} <${originalEmail.from_address}>`
    : originalEmail.from_address

  const toDisplay = originalEmail.to_addresses
    .map(t => t.name ? `${t.name} <${t.email}>` : t.email)
    .join(', ')

  const dateStr = originalEmail.sent_at
    ? new Date(originalEmail.sent_at).toLocaleString()
    : 'Unknown date'

  if (isHtml) {
    const content = originalEmail.body_html || originalEmail.body_text || ''
    return `
      <br><br>
      <div>---------- Forwarded message ---------</div>
      <div>From: ${fromDisplay}</div>
      <div>Date: ${dateStr}</div>
      <div>Subject: ${originalEmail.subject || '(no subject)'}</div>
      <div>To: ${toDisplay}</div>
      <br>
      ${content}
    `
  }

  const content = originalEmail.body_text || stripHtml(originalEmail.body_html || '')
  return `

---------- Forwarded message ---------
From: ${fromDisplay}
Date: ${dateStr}
Subject: ${originalEmail.subject || '(no subject)'}
To: ${toDisplay}

${content}`
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/
  return domainRegex.test(domain)
}

// ============================================================================
// File Size Helpers
// ============================================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Check if file size is within limit
 */
export function isFileSizeValid(bytes: number, maxMB = 25): boolean {
  return bytes <= maxMB * 1024 * 1024
}

// ============================================================================
// Date Helpers
// ============================================================================

/**
 * Format email date for list display
 */
export function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Same day - show time
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Yesterday
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }

  // Within a week - show day name
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }

  // Same year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Different year - show full date
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Format email date for detail view
 */
export function formatEmailDateFull(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString([], {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
