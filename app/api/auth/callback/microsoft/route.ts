import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import {
  exchangeCodeForTokens,
  getMicrosoftUserProfile,
  parseAuthState,
  calculateExpiresAt,
  MICROSOFT_SCOPES,
} from '@/lib/microsoft-auth'

// Admin client for user creation (bypasses RLS)
const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/auth/callback/microsoft
 * Handles the OAuth callback from Microsoft
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('Microsoft OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    )
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/login?error=missing_parameters', request.url))
  }

  // Parse and validate state
  const state = parseAuthState(stateParam)
  if (!state) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', request.url))
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Get user profile from Microsoft
    const profile = await getMicrosoftUserProfile(tokens.access_token)

    // Extract email and domain
    const email = profile.mail || profile.userPrincipalName
    const domain = email.split('@')[1].toLowerCase()

    // Create or get organization
    const { data: orgData } = await supabaseAdmin.rpc('get_or_create_organization', {
      p_domain: domain,
      p_name: domain,
    })
    const organizationId = orgData

    // Check if user exists in auth.users
    const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = existingAuthUsers?.users?.find((u) => u.email === email.toLowerCase())

    let authUserId: string

    if (existingAuthUser) {
      // Update existing user's metadata
      authUserId = existingAuthUser.id
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          full_name: profile.displayName,
          first_name: profile.givenName,
          last_name: profile.surname,
          microsoft_id: profile.id,
          microsoft_linked: true,
        },
      })
    } else {
      // Create new auth user
      const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: true, // Microsoft already verified the email
        user_metadata: {
          full_name: profile.displayName,
          first_name: profile.givenName,
          last_name: profile.surname,
          microsoft_id: profile.id,
          microsoft_linked: true,
        },
      })

      if (createError || !newAuthUser.user) {
        console.error('Failed to create auth user:', createError)
        return NextResponse.redirect(new URL('/login?error=user_creation_failed', request.url))
      }

      authUserId = newAuthUser.user.id
    }

    // Check if user exists in users table
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_id', authUserId)
      .single()

    let userId: string

    if (existingUser) {
      userId = existingUser.id
      // Update user with organization link
      await supabaseAdmin
        .from('users')
        .update({
          organization_id: organizationId,
          microsoft_linked: true,
          first_name: profile.givenName || profile.displayName?.split(' ')[0] || 'User',
          last_name: profile.surname || profile.displayName?.split(' ').slice(1).join(' ') || '',
        })
        .eq('id', userId)
    } else {
      // Create new user in users table
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          auth_id: authUserId,
          email: email.toLowerCase(),
          first_name: profile.givenName || profile.displayName?.split(' ')[0] || 'User',
          last_name: profile.surname || profile.displayName?.split(' ').slice(1).join(' ') || '',
          organization_id: organizationId,
          microsoft_linked: true,
          role: 'sales_rep', // Default role
          is_active: true,
        })
        .select('id')
        .single()

      if (insertError || !newUser) {
        console.error('Failed to create user:', insertError)
        return NextResponse.redirect(new URL('/login?error=user_creation_failed', request.url))
      }

      userId = newUser.id
    }

    // Auto-assign extension for citadelgold.com users
    if (domain === 'citadelgold.com') {
      const { data: extResult } = await supabaseAdmin.rpc('assign_user_extension', {
        p_user_id: userId,
      })
      if (extResult) {
        console.log(`[Microsoft OAuth] Assigned extension ${extResult} to user ${email}`)
      }
    }

    // Store Microsoft OAuth tokens
    const expiresAt = calculateExpiresAt(tokens.expires_in)
    const { error: tokenError } = await supabaseAdmin.from('microsoft_oauth_tokens').upsert(
      {
        user_id: userId,
        email: email.toLowerCase(),
        microsoft_user_id: profile.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        scopes: MICROSOFT_SCOPES,
        sync_enabled: true,
      },
      {
        onConflict: 'user_id,email',
      }
    )

    if (tokenError) {
      console.error('Failed to store tokens:', tokenError)
      // Continue anyway - user can re-authenticate later
    }

    // Create email account for Microsoft
    const { data: existingEmailAccount } = await supabaseAdmin
      .from('email_accounts')
      .select('id')
      .eq('email_address', email.toLowerCase())
      .eq('user_id', userId)
      .single()

    if (!existingEmailAccount) {
      // Get the token ID we just created
      const { data: tokenData } = await supabaseAdmin
        .from('microsoft_oauth_tokens')
        .select('id')
        .eq('user_id', userId)
        .eq('email', email.toLowerCase())
        .single()

      await supabaseAdmin.from('email_accounts').insert({
        email_address: email.toLowerCase(),
        display_name: profile.displayName,
        user_id: userId,
        is_primary: true,
        is_active: true,
        provider: 'microsoft',
        microsoft_token_id: tokenData?.id,
      })
    }

    // Create Supabase session for the user
    // We use a magic link approach by generating a one-time sign-in link
    const { data: sessionData, error: sessionError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email.toLowerCase(),
        options: {
          redirectTo: state.redirect,
        },
      })

    if (sessionError || !sessionData.properties?.hashed_token) {
      console.error('Failed to generate session:', sessionError)
      return NextResponse.redirect(new URL('/login?error=session_failed', request.url))
    }

    // Create server client to set session cookies
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    // Verify the token hash to establish session
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: sessionData.properties.hashed_token,
      type: 'magiclink',
    })

    if (verifyError) {
      console.error('Failed to verify OTP:', verifyError)
      return NextResponse.redirect(new URL('/login?error=session_failed', request.url))
    }

    // Redirect to the intended destination
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url
    return NextResponse.redirect(new URL(state.redirect, appUrl))
  } catch (error) {
    console.error('Microsoft OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent((error as Error).message)}`, request.url)
    )
  }
}
