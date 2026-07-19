'use client'
import { useState } from 'react'

export function BookingForm({ slug, primary, ctaLabel = 'Request booking', variant = 'light', buttonCls }: {
  slug: string
  primary: string
  ctaLabel?: string
  variant?: 'light' | 'dark'
  buttonCls?: string
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    setError('')
    const form = e.currentTarget
    const fd = new FormData(form)
    // Preferred slot is stamped into the description so the enquiry inbox
    // surfaces it without needing a schema change yet.
    const date = fd.get('preferred_date') as string | null
    const time = fd.get('preferred_time') as string | null
    const slot = [date, time].filter(Boolean).join(' · ')
    const note = fd.get('message') ? String(fd.get('message')) : ''
    try {
      const res = await fetch('/api/site/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: fd.get('name'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          message: [slot && `Preferred: ${slot}`, note].filter(Boolean).join('\n\n'),
          kind: 'booking',
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not submit')
      setState('sent')
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit')
      setState('error')
    }
  }

  if (state === 'sent') {
    return variant === 'dark' ? (
      <div className="rounded-xl border border-white/20 bg-white/5 p-6 text-center text-white/90">
        Booking request sent — we&apos;ll be in touch shortly to confirm.
      </div>
    ) : (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center text-green-700">
        Booking request sent — we&apos;ll be in touch shortly to confirm.
      </div>
    )
  }

  const inputCls = variant === 'dark'
    ? 'w-full border-b border-white/30 bg-transparent px-1 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/70 [color-scheme:dark]'
    : 'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0'
  const today = new Date().toISOString().slice(0, 10)
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input name="name" required placeholder="Your name" className={inputCls} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input name="email" type="email" placeholder="Email" className={inputCls} />
        <input name="phone" placeholder="Phone" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <input name="preferred_date" type="date" min={today} className={inputCls} required />
        <select name="preferred_time" className={inputCls} defaultValue="">
          <option value="" disabled>Time of day</option>
          <option value="Morning (8–12)">Morning (8–12)</option>
          <option value="Afternoon (12–5)">Afternoon (12–5)</option>
          <option value="Anytime">Anytime</option>
        </select>
      </div>
      <textarea name="message" rows={3} placeholder="What do you need help with?" className={inputCls} />
      {error && <p className={`text-sm ${variant === 'dark' ? 'text-red-300' : 'text-red-600'}`}>{error}</p>}
      <button
        type="submit"
        disabled={state === 'sending'}
        className={buttonCls ?? 'w-full rounded-lg py-3 font-semibold text-white disabled:opacity-60'}
        style={buttonCls ? undefined : { background: primary }}
      >
        {state === 'sending' ? 'Sending…' : ctaLabel}
      </button>
    </form>
  )
}
