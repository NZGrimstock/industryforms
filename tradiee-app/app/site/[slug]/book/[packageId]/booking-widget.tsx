'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle, Clock } from 'lucide-react'
import type { Stripe, StripeElements } from '@stripe/stripe-js'

type Pkg = {
  id: string; name: string; description: string | null; duration_minutes: number
  price: number; deposit_amount: number | null; deposit_percent: number | null; requires_deposit: boolean
}
type Slot = { startsAt: string; endsAt: string; profileId: string | null }

const inputCls = 'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0'

export function BookingWidget({ companyId, pkg, companyPhone }: { companyId: string; pkg: Pkg; companyPhone: string | null }) {
  const [step, setStep] = useState<'slot' | 'details' | 'deposit' | 'pending' | 'done' | 'error'>('slot')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', siteAddress: '', notes: '' })
  const [depositAmount, setDepositAmount] = useState(0)
  const [finalStatus, setFinalStatus] = useState<'confirmed' | 'requested' | null>(null)
  const stripeRef = useRef<Stripe | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)
  const stripeAccountIdRef = useRef<string | null>(null)

  // Some payment methods force a real top-level redirect (e.g. a 3D Secure
  // challenge) despite confirmPayment's redirect: 'if_required' — a full page
  // reload wipes all component state (bookingId, depositAmount, the mounted
  // Payment Element), so recover what's needed from the URL instead of
  // silently restarting the whole booking wizard from the slot picker with
  // no acknowledgment of whether the deposit actually went through.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clientSecret = params.get('payment_intent_client_secret')
    if (!clientSecret) return
    const stripeAccountId = params.get('sa')
    const returnedBookingId = params.get('bk')
    const returnedDepositAmount = params.get('da')

    ;(async () => {
      if (returnedBookingId) setBookingId(returnedBookingId)
      if (returnedDepositAmount) setDepositAmount(Number(returnedDepositAmount))

      const { loadStripe } = await import('@stripe/stripe-js')
      const stripe = await loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
      )
      window.history.replaceState(null, '', window.location.pathname)
      if (!stripe) { setError('Stripe failed to load'); setStep('error'); return }

      const { paymentIntent, error: piError } = await stripe.retrievePaymentIntent(clientSecret)
      if (piError || !paymentIntent) { setError(piError?.message ?? 'Could not confirm payment status'); setStep('error'); return }

      if (paymentIntent.status === 'succeeded') { setFinalStatus('confirmed'); setStep('done') }
      else if (paymentIntent.status === 'processing') setStep('pending')
      // Anything else (requires_payment_method, canceled, …) — re-enter the
      // deposit step so the payDeposit() effect below fires again; it reuses
      // the same open PaymentIntent rather than creating a fresh one.
      else setStep('deposit')
    })()
  }, [])

  useEffect(() => {
    fetch(`/api/bookings/availability?companyId=${companyId}&packageId=${pkg.id}`)
      .then(res => res.json())
      .then(data => setSlots(data.slots ?? []))
      .finally(() => setLoadingSlots(false))
  }, [companyId, pkg.id])

  async function pickSlot(slot: Slot) {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/hold', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, packageId: pkg.id, profileId: slot.profileId, startsAt: slot.startsAt, endsAt: slot.endsAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'That slot was just taken — pick another.')
      setBookingId(data.bookingId)
      setSelectedSlot(slot)
      setStep('details')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not hold that slot')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!bookingId) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not confirm booking')
      if (data.depositRequired > 0) {
        setDepositAmount(data.depositRequired)
        setStep('deposit')
      } else {
        setFinalStatus(data.status === 'confirmed' ? 'confirmed' : 'requested')
        setStep('done')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm booking')
    } finally {
      setSubmitting(false)
    }
  }

  async function payDeposit() {
    if (!bookingId) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/deposit-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start payment')

      const { loadStripe } = await import('@stripe/stripe-js')
      // Must be loaded scoped to the connected account when the deposit was
      // charged as a direct charge (data.stripeAccountId), or Stripe.js can't
      // resolve the clientSecret and the Payment Element mounts empty.
      const stripe = await loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        data.stripeAccountId ? { stripeAccount: data.stripeAccountId } : undefined
      )
      if (!stripe) throw new Error('Stripe failed to load')

      stripeRef.current = stripe
      stripeAccountIdRef.current = data.stripeAccountId ?? null
      elementsRef.current = stripe.elements({ clientSecret: data.clientSecret, appearance: { theme: 'stripe' } })
      elementsRef.current.create('payment').mount('#booking-payment-element')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (step === 'deposit') payDeposit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function confirmPayment() {
    setSubmitting(true)
    setError('')
    try {
      const stripe = stripeRef.current
      const elements = elementsRef.current
      if (!stripe || !elements) throw new Error('Payment form not ready')

      // Carries what's needed to resume on the redirect-return effect above
      // (a full page reload wipes bookingId/depositAmount/stripeAccountId,
      // none of which are otherwise recoverable from a fresh page load).
      const returnUrl = new URL(window.location.href)
      if (bookingId) returnUrl.searchParams.set('bk', bookingId)
      if (stripeAccountIdRef.current) returnUrl.searchParams.set('sa', stripeAccountIdRef.current)
      returnUrl.searchParams.set('da', String(depositAmount))

      const { error } = await stripe.confirmPayment({
        elements, redirect: 'if_required', confirmParams: { return_url: returnUrl.toString() },
      })
      if (error) throw new Error(error.message ?? 'Payment failed')
      setFinalStatus('confirmed')
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
        <p className="font-semibold text-green-800">
          {finalStatus === 'confirmed' ? 'Booking confirmed!' : 'Booking request sent!'}
        </p>
        <p className="text-sm text-green-700 mt-1">
          {finalStatus === 'confirmed'
            ? `We'll see you ${selectedSlot ? new Date(selectedSlot.startsAt).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' }) : ''}.`
            : "We'll confirm your booking shortly."}
        </p>
        {companyPhone && <p className="text-xs text-green-600 mt-2">Questions? Call {companyPhone}</p>}
      </div>
    )
  }

  if (step === 'pending') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <Loader2 className="h-8 w-8 text-amber-600 mx-auto mb-2 animate-spin" />
        <p className="font-semibold text-amber-800">Payment is processing</p>
        <p className="text-sm text-amber-700 mt-1">We&apos;ll confirm your booking as soon as it&apos;s through — no need to try again.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <p className="font-semibold text-gray-900">{pkg.name}</p>
        {pkg.description && <p className="text-sm text-gray-500 mt-0.5">{pkg.description}</p>}
        <p className="text-xs text-gray-400 mt-1">{pkg.duration_minutes} min · ${Number(pkg.price).toFixed(2)}{pkg.requires_deposit && ' · deposit required'}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {step === 'slot' && (
        <div className="space-y-2">
          {loadingSlots && <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading availability…</p>}
          {!loadingSlots && slots.length === 0 && <p className="text-sm text-gray-400">No available slots right now — please check back later.</p>}
          <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {slots.map((slot, i) => (
              <button
                key={i}
                disabled={submitting}
                onClick={() => pickSlot(slot)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:border-[var(--accent,#f97316)] hover:text-[var(--accent,#f97316)] disabled:opacity-50"
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {new Date(slot.startsAt).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'details' && selectedSlot && (
        <form onSubmit={submitDetails} className="space-y-3">
          <p className="text-sm text-gray-600">{new Date(selectedSlot.startsAt).toLocaleString('en-NZ', { dateStyle: 'full', timeStyle: 'short' })}</p>
          <input required placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <input type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
          </div>
          <input placeholder="Job site address" value={form.siteAddress} onChange={e => setForm(f => ({ ...f, siteAddress: e.target.value }))} className={inputCls} />
          <textarea placeholder="Anything we should know? (optional)" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} />
          <button
            type="submit"
            disabled={submitting || !form.name || (!form.email && !form.phone)}
            className="w-full rounded-lg bg-[var(--accent,#f97316)] py-3 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Continue'}
          </button>
        </form>
      )}

      {step === 'deposit' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">A deposit of ${depositAmount.toFixed(2)} is required to confirm your booking.</p>
          <div id="booking-payment-element" className="p-4 border border-gray-200 rounded-xl" />
          <button
            onClick={confirmPayment}
            disabled={submitting}
            className="w-full rounded-lg bg-[var(--accent,#f97316)] py-3 font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Processing…' : `Pay $${depositAmount.toFixed(2)} deposit`}
          </button>
        </div>
      )}
    </div>
  )
}
