'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createClient())
  const [ready, setReady] = useState<'checking' | 'ready' | 'expired'>('checking')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // The recovery link puts tokens in the URL hash; the client above consumes
    // them on init, so give it a tick before checking for a session.
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setReady(session ? 'ready' : 'expired')
    }, 300)
    return () => clearTimeout(timer)
  }, [supabase])

  async function handleSubmit() {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (authError) { setError(authError.message); return }
    setDone(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image src="/Logo.png" alt="IndustryForms" width={200} height={109} className="object-contain h-14 w-auto" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {done ? (
            <p className="text-sm text-gray-600">Password updated. Redirecting…</p>
          ) : ready === 'checking' ? (
            <p className="text-sm text-gray-600">Checking your link…</p>
          ) : ready === 'expired' ? (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expired</h1>
              <p className="text-sm text-gray-600">
                This password reset link is invalid or has expired. Request a new one from the sign-in page.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-6">Set a new password</h1>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                  <div className="relative">
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
