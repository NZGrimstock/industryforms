'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'

const PLANS = [
  { key: 'solo', label: 'Solo', price: '$29', desc: '1 user · unlimited jobs, quotes & invoices' },
  { key: 'team', label: 'Team', price: '$49', desc: 'Up to 10 users · all features', popular: true },
  { key: 'pro', label: 'Pro', price: '$99', desc: 'Unlimited users · priority support' },
]

export function UpgradeClient({ companyName, stillHasFullAccess }: { companyName: string; stillHasFullAccess: boolean }) {
  const supabase = createClient()
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')

  async function subscribe(plan: string) {
    setLoading(plan)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not start checkout')
      window.location.assign(data.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setLoading('')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <p className="text-sm font-semibold text-orange-600 mb-1">IndustryForms</p>
          <h1 className="text-2xl font-bold text-gray-900">{stillHasFullAccess ? 'Choose a plan' : 'You’re on the Free plan — free forever'}</h1>
          <p className="text-sm text-gray-500 mt-2">
            {stillHasFullAccess
              ? <>Upgrade {companyName ? <strong>{companyName}</strong> : 'your account'} any time — no rush, your trial is still active. Cancel anytime.</>
              : <>No credit card needed to stay on Free. Upgrade {companyName ? <strong>{companyName}</strong> : 'your account'} any time for more seats, jobs, and features. Cancel anytime.</>}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 text-center">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(p => (
            <div key={p.key} className={`rounded-2xl border bg-white p-5 flex flex-col ${p.popular ? 'border-orange-400 ring-1 ring-orange-200' : 'border-gray-200'}`}>
              {p.popular && <span className="self-start mb-2 text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Most popular</span>}
              <h2 className="text-lg font-semibold text-gray-900">{p.label}</h2>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{p.price}</span><span className="text-sm text-gray-500">/mo</span>
              </p>
              <p className="text-sm text-gray-500 mt-2 flex-1">{p.desc}</p>
              <button
                onClick={() => subscribe(p.key)}
                disabled={!!loading}
                className={`mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 ${p.popular ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                {loading === p.key ? 'Starting…' : <>Choose {p.label} <Check className="h-4 w-4" /></>}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-6">
          <button onClick={signOut} className="text-sm text-gray-400 hover:text-gray-600 underline">Sign out</button>
        </div>
      </div>
    </div>
  )
}
