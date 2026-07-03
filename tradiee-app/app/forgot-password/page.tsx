'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/browser'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    if (!email) { setError('Enter your email.'); return }
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (authError) { setError(authError.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image src="/Logo.png" alt="IndustryForms" width={200} height={109} className="object-contain h-14 w-auto" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {sent ? (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h1>
              <p className="text-sm text-gray-600">
                If an account exists for {email}, we&apos;ve sent a link to reset your password.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-6">Reset your password</h1>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                    autoFocus
                  />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
                >
                  {loading ? 'Sending…' : 'Send recovery link'}
                </button>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/login" className="text-orange-500 hover:text-orange-600 font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
