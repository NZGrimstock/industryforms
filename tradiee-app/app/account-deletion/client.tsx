'use client'
import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function AccountDeletionForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
    reason: '',
    website: '',
  })

  function setField(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError('')
    const res = await fetch('/api/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Could not submit the request. Please email privacy@industryforms.co.nz.')
      setStatus('error')
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-green-900">
        <h2 className="text-lg font-semibold mb-2">Request received</h2>
        <p className="text-sm">We have received your account deletion request. We will verify account ownership and respond to the email address provided.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <input
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={e => setField('website', e.target.value)}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
        <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.fullName} onChange={e => setField('fullName', e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Account email <span className="text-red-500">*</span></label>
        <input type="email" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.email} onChange={e => setField('email', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.phone} onChange={e => setField('phone', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.businessName} onChange={e => setField('businessName', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Anything else we should know?</label>
        <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={4} value={form.reason} onChange={e => setField('reason', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {status === 'sending' ? 'Submitting...' : 'Submit deletion request'}
      </button>
    </form>
  )
}
