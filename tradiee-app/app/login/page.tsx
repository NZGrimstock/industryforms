'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  async function handleSubmit() {
    if (!email || !password) { setError('Enter your email and password.'); return }
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw new Error(authError.message)

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const factor = factors?.totp.find(f => f.status === 'verified')
        if (factor) {
          setMfaFactorId(factor.id)
          setLoading(false)
          return
        }
      }
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
      setLoading(false)
    }
  }

  async function handleMfaSubmit() {
    if (!mfaFactorId || mfaCode.length < 6) return
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (challengeErr) throw new Error(challengeErr.message)
      const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode })
      if (verifyErr) throw new Error(verifyErr.message)
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image src="/Logo.png" alt="IndustryForms" width={200} height={109} className="object-contain h-14 w-auto" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {mfaFactorId ? (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-6">Enter your authenticator code</h1>
              <form className="space-y-4" onSubmit={e => { e.preventDefault(); void handleMfaSubmit() }}>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456" autoFocus
                />
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || mfaCode.length < 6}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-6">Sign in to your account</h1>
              <form className="space-y-4" onSubmit={e => { e.preventDefault(); void handleSubmit() }}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right -mt-2">
                  <Link href="/forgot-password" className="text-sm text-orange-500 hover:text-orange-600 font-medium">
                    Forgot password? Click to recover
                  </Link>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          No account?{' '}
          <Link href="/signup" className="text-orange-500 hover:text-orange-600 font-medium">Get started free</Link>
        </p>
        <p className="text-center text-sm font-medium text-gray-700 mt-1">
          28 day Free Trial &mdash; No credit card required!
        </p>
      </div>
    </div>
  )
}
