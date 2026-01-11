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
  'citadelgold.com',
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

  useEffect(() => {
    const domain = email.split('@')[1]?.toLowerCase()
    if (domain) {
      if (isMicrosoftDomain(domain)) {
        setIsMicrosoftEmail(true)
        return
      }

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

    let shouldUseMicrosoft = false

    if (domain) {
      if (isMicrosoftDomain(domain)) {
        shouldUseMicrosoft = true
      } else {
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
        <div className="bg-red-500/10 backdrop-blur-sm border border-red-400/30 text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-all duration-300 hover:bg-white/70 shadow-sm"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">
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
            className="block w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-gray-200/50 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-all duration-300 hover:bg-white/70 shadow-sm"
            placeholder="Enter your password"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 px-4 rounded-xl text-sm font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 30%, #14B8A6 60%, #0D9488 100%)',
          boxShadow: '0 10px 40px rgba(45, 212, 191, 0.35), 0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        <span className="relative z-10 tracking-wide uppercase">
          {loading
            ? isMicrosoftEmail
              ? 'Connecting to Microsoft...'
              : 'Signing in...'
            : isMicrosoftEmail
            ? 'Continue with Microsoft'
            : 'Login'}
        </span>
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      {isMicrosoftEmail && (
        <p className="text-center text-xs text-white/80">
          You&apos;ll be redirected to Microsoft to sign in
        </p>
      )}

      <div className="flex items-center justify-center gap-4 text-sm pt-2">
        <Link href="/forgot-password" className="text-white hover:text-cyan-300 transition-colors">
          Forgot Password?
        </Link>
        <span className="text-white/50">|</span>
        <Link href="/signup" className="text-white hover:text-cyan-300 transition-colors">
          Create Account
        </Link>
      </div>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 -z-20">
        <Image
          src="/login-background.png"
          alt="Background"
          fill
          className="object-cover"
          priority
          quality={90}
        />
      </div>

      {/* Dark overlay for better contrast */}
      <div className="absolute inset-0 -z-10 bg-black/30" />

      {/* Floating decorative elements */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-green-300/30 to-emerald-400/20 rounded-full blur-2xl animate-pulse" />
      <div className="absolute bottom-32 right-20 w-40 h-40 bg-gradient-to-br from-purple-300/25 to-violet-400/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/3 right-1/4 w-24 h-24 bg-gradient-to-br from-cyan-300/30 to-teal-400/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Glass Card */}
      <div
        className="w-full max-w-md relative animate-fade-in"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.35) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '1.5rem',
          border: '1px solid rgba(255,255,255,0.4)',
          boxShadow: `
            0 32px 64px -12px rgba(0, 0, 0, 0.25),
            0 16px 32px -8px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255,255,255,0.6),
            inset 0 -1px 0 rgba(0,0,0,0.05)
          `,
          padding: '2.5rem',
        }}
      >
        {/* Glossy top edge highlight */}
        <div
          className="absolute top-0 left-4 right-4 h-px opacity-80"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,1), transparent)',
          }}
        />

        {/* Logo Header */}
        <div className="text-center mb-8 relative">
          <div className="flex flex-col items-center gap-2">
            <Image
              src="/byetalk-logo.png"
              alt="Byetalk"
              width={180}
              height={80}
              className="drop-shadow-sm"
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
        </div>

        {/* Login Form */}
        <Suspense fallback={<div className="text-gray-400 text-center py-8">Loading...</div>}>
          <LoginForm />
        </Suspense>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/20">
          <p className="text-center text-xs text-white/70">
            Secure cloud communications platform
          </p>
        </div>
      </div>

      {/* Add subtle animation keyframes */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
      `}</style>
    </div>
  )
}
