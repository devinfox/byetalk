// Microsoft OAuth Authentication Library
// Handles OAuth2 flow with Microsoft/Azure AD for Outlook integration

import { MicrosoftTokenResponse, MicrosoftUserProfile, MicrosoftAuthState } from '@/types/microsoft.types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com'
const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0'

// Tenant ID: 'common' allows any Microsoft account (personal + work/school)
// Use 'organizations' for work/school only, or specific tenant ID for single-tenant
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common'

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!

// Scopes required for email sync
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access', // Required for refresh tokens
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
]

// ============================================================================
// OAUTH URL GENERATION
// ============================================================================

/**
 * Generates the Microsoft OAuth authorization URL
 * @param state - Encrypted state containing email and redirect info
 * @param loginHint - Pre-fill the email in Microsoft's login form
 */
export function getMicrosoftAuthUrl(state: string, loginHint?: string): string {
  const redirectUri = getRedirectUri()

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state: state,
    prompt: 'select_account', // Always show account picker
  })

  // Pre-fill email if provided
  if (loginHint) {
    params.set('login_hint', loginHint)
  }

  return `${MICROSOFT_AUTH_URL}/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`
}

/**
 * Gets the OAuth redirect URI based on environment
 */
export function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  // Remove trailing slash if present
  const baseUrl = appUrl.replace(/\/$/, '')
  return `${baseUrl}/api/auth/callback/microsoft`
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

/**
 * Exchanges authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<MicrosoftTokenResponse> {
  const redirectUri = getRedirectUri()

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  })

  const response = await fetch(`${MICROSOFT_AUTH_URL}/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Microsoft token exchange error:', error)
    throw new Error(error.error_description || 'Failed to exchange code for tokens')
  }

  return response.json()
}

/**
 * Refreshes an expired access token using the refresh token
 */
export async function refreshMicrosoftToken(refreshToken: string): Promise<MicrosoftTokenResponse> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
  })

  const response = await fetch(`${MICROSOFT_AUTH_URL}/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Microsoft token refresh error:', error)
    throw new Error(error.error_description || 'Failed to refresh token')
  }

  return response.json()
}

// ============================================================================
// USER PROFILE
// ============================================================================

/**
 * Fetches the user's profile from Microsoft Graph API
 */
export async function getMicrosoftUserProfile(accessToken: string): Promise<MicrosoftUserProfile> {
  const response = await fetch(`${MICROSOFT_GRAPH_URL}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Microsoft profile fetch error:', error)
    throw new Error(error.error?.message || 'Failed to fetch user profile')
  }

  return response.json()
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Creates and encrypts OAuth state for CSRF protection
 */
export function createAuthState(email: string, redirect: string): string {
  const state: MicrosoftAuthState = {
    email,
    redirect,
    nonce: generateNonce(),
    timestamp: Date.now(),
  }

  // In production, this should be encrypted
  return Buffer.from(JSON.stringify(state)).toString('base64url')
}

/**
 * Decrypts and validates OAuth state
 */
export function parseAuthState(stateString: string): MicrosoftAuthState | null {
  try {
    const decoded = Buffer.from(stateString, 'base64url').toString('utf-8')
    const state: MicrosoftAuthState = JSON.parse(decoded)

    // Validate state is not too old (10 minutes max)
    const maxAge = 10 * 60 * 1000 // 10 minutes in ms
    if (Date.now() - state.timestamp > maxAge) {
      console.error('OAuth state expired')
      return null
    }

    return state
  } catch (error) {
    console.error('Failed to parse OAuth state:', error)
    return null
  }
}

/**
 * Generates a random nonce for CSRF protection
 */
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// ============================================================================
// DOMAIN DETECTION
// ============================================================================

/**
 * Known Microsoft email domains
 */
const MICROSOFT_DOMAINS = [
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'outlook.co.uk',
  'hotmail.co.uk',
  'live.co.uk',
]

/**
 * Checks if an email domain is a known Microsoft domain
 */
export function isMicrosoftDomain(domain: string): boolean {
  return MICROSOFT_DOMAINS.includes(domain.toLowerCase())
}

/**
 * Checks if an email should use Microsoft OAuth
 * Returns true for Microsoft domains or domains with Microsoft tenant configured
 */
export async function shouldUseMicrosoftAuth(
  email: string,
  checkOrganization: (domain: string) => Promise<boolean>
): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false

  // Check known Microsoft domains
  if (isMicrosoftDomain(domain)) {
    return true
  }

  // Check if organization has Microsoft OAuth configured
  return checkOrganization(domain)
}

// ============================================================================
// TOKEN HELPERS
// ============================================================================

/**
 * Calculates token expiration timestamp from expires_in seconds
 */
export function calculateExpiresAt(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000)
}

/**
 * Checks if a token is expired (with 5-minute buffer)
 */
export function isTokenExpired(expiresAt: Date | string): boolean {
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  const buffer = 5 * 60 * 1000 // 5 minutes
  return Date.now() >= expiry.getTime() - buffer
}

/**
 * Gets a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(
  accessToken: string,
  refreshToken: string,
  expiresAt: Date | string,
  onRefresh: (newTokens: MicrosoftTokenResponse) => Promise<void>
): Promise<string> {
  if (!isTokenExpired(expiresAt)) {
    return accessToken
  }

  // Token expired, refresh it
  const newTokens = await refreshMicrosoftToken(refreshToken)
  await onRefresh(newTokens)
  return newTokens.access_token
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SCOPES as MICROSOFT_SCOPES }
