'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Wrench, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

export default function SignupPage() {
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [tradeType, setTradeType] = useState('')
  const [country, setCountry] = useState('NZ')

  const TRADE_TYPES = [
    'Builder / General contractor',
    'Electrician',
    'Plumber',
    'Drainlayer',
    'Gasfitter',
    'Roofer',
    'Painter & decorator',
    'Tiler',
    'Flooring installer',
    'Landscaper / Gardener',
    'HVAC / Refrigeration',
    'Fencer',
    'Concreter',
    'Plasterer',
    'Cabinet maker / Joiner',
    'Pool & spa technician',
    'Fire protection',
    'Solar / Renewable energy',
    'Security / Alarm systems',
    'Cleaning services',
    'Automotive',
    'Engineer',
    'Other trades',
  ]

  async function handleSubmit() {
    if (!fullName || !email || !password || !companyName || !phone || !tradeType) {
      setError('Please fill in all required fields, including phone number and trade.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, companyName, companyAddress, tradeType, country, phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Signup failed')

      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw new Error(signInError.message)
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">IndustryForms</span>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 mb-6">Free 30-day trial, no credit card required.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your name *</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work email *</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <div className="relative">
                <input className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business name *</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number *</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+64 21 123 4567" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business address</label>
              <AddressAutocomplete value={companyAddress} onChange={setCompanyAddress} placeholder="Start typing your address…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trade / industry *</label>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={tradeType} onChange={e => setTradeType(e.target.value)} required>
                <option value="">Select your trade…</option>
                {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={country} onChange={e => setCountry(e.target.value)}>
                <option value="NZ">New Zealand</option>
                <option value="AU">Australia</option>
              </select>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-500 hover:text-orange-600 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
