'use client'
import { useState } from 'react'

export function ContactForm({ slug, primary }: { slug: string; primary: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    setError('')
    const form = e.currentTarget
    const fd = new FormData(form)
    try {
      const res = await fetch('/api/site/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: fd.get('name'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          message: fd.get('message'),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
      setState('sent')
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center text-green-700">
        Thanks — we&apos;ve got your message and will be in touch shortly.
      </div>
    )
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0'
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="name" required placeholder="Your name" className={inputCls} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input name="email" type="email" placeholder="Email" className={inputCls} />
        <input name="phone" placeholder="Phone" className={inputCls} />
      </div>
      <textarea name="message" required rows={4} placeholder="How can we help?" className={inputCls} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-60"
        style={{ background: primary }}
      >
        {state === 'sending' ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  )
}
