'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'

// Known Microsoft email domains
const MICROSOFT_DOMAINS = [
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'outlook.co.uk',
  'hotmail.co.uk',
  'live.co.uk',
  'citadelgold.com', // Custom domain using Microsoft 365
]

function isMicrosoftDomain(domain: string): boolean {
  return MICROSOFT_DOMAINS.includes(domain.toLowerCase())
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(errorParam)
  const [loading, setLoading] = useState(false)
  const [isMicrosoftEmail, setIsMicrosoftEmail] = useState(false)

  // Check if email domain is Microsoft when email changes
  useEffect(() => {
    const domain = email.split('@')[1]?.toLowerCase()
    if (domain) {
      // Check known Microsoft domains
      if (isMicrosoftDomain(domain)) {
        setIsMicrosoftEmail(true)
        return
      }

      // Check if organization has Microsoft OAuth enabled
      const checkOrganization = async () => {
        const supabase = createClient()
        const { data } = await supabase
          .from('organizations')
          .select('allow_microsoft_login')
          .eq('domain', domain)
          .single()

        setIsMicrosoftEmail(data?.allow_microsoft_login === true)
      }

      checkOrganization()
    } else {
      setIsMicrosoftEmail(false)
    }
  }, [email])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const domain = email.split('@')[1]?.toLowerCase()

    // Check if this is a Microsoft domain or organization with Microsoft OAuth
    let shouldUseMicrosoft = false

    if (domain) {
      if (isMicrosoftDomain(domain)) {
        shouldUseMicrosoft = true
      } else {
        // Check organization
        const supabase = createClient()
        const { data } = await supabase
          .from('organizations')
          .select('allow_microsoft_login')
          .eq('domain', domain)
          .single()

        shouldUseMicrosoft = data?.allow_microsoft_login === true
      }
    }

    if (shouldUseMicrosoft) {
      // Redirect to Microsoft OAuth
      try {
        const response = await fetch('/api/auth/microsoft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, redirect }),
        })

        const data = await response.json()

        if (data.authUrl) {
          window.location.href = data.authUrl
          return
        } else {
          setError(data.error || 'Failed to initiate Microsoft login')
          setLoading(false)
        }
      } catch {
        setError('Failed to connect to Microsoft')
        setLoading(false)
      }
      return
    }

    // Standard password authentication
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      {error && (
        <div className="bg-red-500/10 backdrop-blur-sm border border-red-400/30 text-red-200 px-4 py-3 rounded-2xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full px-4 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all duration-300 hover:bg-white/[0.12]"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-1.5">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full px-4 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all duration-300 hover:bg-white/[0.12]"
            placeholder="Enter your password"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
        style={{
          background: 'linear-gradient(135deg, #ffd700 0%, #ffec8b 20%, #daa520 50%, #b8860b 80%, #cd853f 100%)',
          boxShadow: '0 8px 32px rgba(218, 165, 32, 0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <span className="relative z-10 font-bold">
          {loading
            ? isMicrosoftEmail
              ? 'Connecting to Microsoft...'
              : 'Signing in...'
            : isMicrosoftEmail
            ? 'Continue with Microsoft'
            : 'Sign in'}
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-200/30 to-amber-300/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      {isMicrosoftEmail && (
        <p className="text-center text-xs text-white/40">
          You&apos;ll be redirected to Microsoft to sign in
        </p>
      )}

      <p className="text-center text-sm text-white/60">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
          Sign up
        </Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Dark background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(135deg, #09090b 0%, #18181b 50%, #0a0a0a 100%)',
        }}
      />

      {/* Subtle floating orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-yellow-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-900/5 rounded-full blur-3xl" />

      {/* Glossy light reflection overlay */}
      <div
        className="absolute inset-0 -z-5 opacity-20"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(255,215,0,0.05) 0%, transparent 50%)',
        }}
      />

      {/* Glass card */}
      <div
        className="w-full max-w-md relative"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '2rem',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
          padding: '2.5rem',
        }}
      >
        {/* Inner glow effect */}
        <div
          className="absolute inset-0 rounded-[2rem] opacity-50 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at top, rgba(218, 165, 32, 0.1) 0%, transparent 60%)',
          }}
        />

        {/* Logo/Header */}
        <div className="text-center mb-8 relative">
          <div className="flex justify-center mb-3">
            <Image
              src="/citadel-gold-logo.png"
              alt="Citadel Gold"
              width={200}
              height={80}
              className="drop-shadow-[0_0_30px_rgba(218,165,32,0.3)]"
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          <p className="text-white/50 text-sm">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <Suspense fallback={<div className="text-white/40 text-center py-8">Loading...</div>}>
          <LoginForm />
        </Suspense>

        {/* Powered by Byetalk */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="flex flex-col items-center gap-2">
            <span className="text-white/40 text-xs uppercase tracking-widest">Powered by</span>
            <Image
              src="/byetalk-logo.png"
              alt="Byetalk"
              width={120}
              height={60}
              className="opacity-70 hover:opacity-100 transition-opacity duration-300"
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
