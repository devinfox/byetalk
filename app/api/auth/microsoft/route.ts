import { NextRequest, NextResponse } from 'next/server'
import { getMicrosoftAuthUrl, createAuthState } from '@/lib/microsoft-auth'

/**
 * POST /api/auth/microsoft
 * Initiates Microsoft OAuth flow
 *
 * Body: { email: string, redirect?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, redirect = '/dashboard' } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Create encrypted state for CSRF protection
    const state = createAuthState(email, redirect)

    // Generate Microsoft OAuth URL with email pre-filled
    const authUrl = getMicrosoftAuthUrl(state, email)

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Microsoft auth initiation error:', error)
    return NextResponse.json({ error: 'Failed to initiate Microsoft login' }, { status: 500 })
  }
}

/**
 * GET /api/auth/microsoft
 * Alternative redirect-based OAuth initiation
 *
 * Query: ?email=xxx&redirect=/dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const email = searchParams.get('email')
    const redirect = searchParams.get('redirect') || '/dashboard'

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=email_required', request.url))
    }

    // Create encrypted state for CSRF protection
    const state = createAuthState(email, redirect)

    // Generate Microsoft OAuth URL with email pre-filled
    const authUrl = getMicrosoftAuthUrl(state, email)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Microsoft auth initiation error:', error)
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url))
  }
}
