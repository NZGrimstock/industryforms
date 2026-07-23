'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Blocking overlay shown when the signed-in user hasn't accepted the current
// Terms of Service version. No dismiss path — the only way out is to accept.
export function TermsGate() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/legal/accept', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not save')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Updated Terms of Service</h2>
        <p className="mb-6 text-sm text-gray-600">
          Please review and accept our{' '}
          <Link href="/terms" target="_blank" className="text-orange-600 underline hover:text-orange-700">
            Terms of Service
          </Link>{' '}
          to continue using IndustryForms. They cover your use of the web and mobile app, and — if
          you collect payments — your responsibilities for chargebacks and disputes.
        </p>
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={accept}
          disabled={loading}
          className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'I agree to the Terms of Service'}
        </button>
      </div>
    </div>
  )
}
