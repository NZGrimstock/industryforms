'use client'
import { useEffect, useRef, useState } from 'react'
import { CreditCard, Loader2, CheckCircle } from 'lucide-react'
import type { Stripe, StripeElements } from '@stripe/stripe-js'

export function PayNowButton({ token }: { token: string; amountDue: number }) {
  const [step, setStep] = useState<'idle' | 'loading' | 'form' | 'done' | 'pending' | 'error'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const stripeRef = useRef<Stripe | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)
  const stripeAccountIdRef = useRef<string | null>(null)

  // Some payment methods force a real top-level redirect (e.g. a 3D Secure
  // challenge) despite confirmPayment's redirect: 'if_required' — Stripe
  // sends the customer back here with payment_intent_client_secret and
  // redirect_status appended to return_url. Without this, the page just
  // re-rendered the same "Ready to pay?" card with no acknowledgment either
  // way, and nothing stopped the customer retrying and paying twice while
  // our own webhook was still catching up.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clientSecret = params.get('payment_intent_client_secret')
    if (!clientSecret) return
    const stripeAccountId = params.get('sa')

    ;(async () => {
      setStep('loading')
      const { loadStripe } = await import('@stripe/stripe-js')
      const stripe = await loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
      )
      // Clean the redirect params off the URL either way, so a refresh
      // doesn't re-run this or leave the secret sitting in the address bar.
      window.history.replaceState(null, '', window.location.pathname)
      if (!stripe) { setErrorMsg('Stripe failed to load'); setStep('error'); return }

      const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret)
      if (error || !paymentIntent) { setErrorMsg(error?.message ?? 'Could not confirm payment status'); setStep('error'); return }

      if (paymentIntent.status === 'succeeded') setStep('done')
      else if (paymentIntent.status === 'processing') setStep('pending')
      else { setErrorMsg('The payment did not go through — please try again.'); setStep('error') }
    })()
  }, [])

  async function startPayment() {
    setStep('loading')
    try {
      const res = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to initialize payment')

      const { loadStripe } = await import('@stripe/stripe-js')
      // Must be loaded scoped to the connected account when the invoice was
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
      setStep('form')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load payment form')
      setStep('error')
    }
  }

  // Mounts the Payment Element once #stripe-payment-element has actually
  // committed to the DOM (step === 'form'). Previously this ran on a bare
  // setTimeout(…, 50) right after setStep('form') in the click handler — a
  // race against React's render commit that lost often enough on phones to
  // leave the element unmounted, so confirmPayment() below rejected with
  // "elements should have a mounted Payment Element or Express Checkout
  // Element." A layout effect only ever runs after the DOM for that render
  // is committed, so the div is guaranteed to exist here.
  useEffect(() => {
    if (step !== 'form' || !elementsRef.current) return
    const paymentEl = elementsRef.current.create('payment')
    paymentEl.mount('#stripe-payment-element')
    return () => paymentEl.unmount()
  }, [step])

  async function submitPayment() {
    // Deliberately does NOT setStep() away from 'form' before confirming —
    // that would unmount #stripe-payment-element (only the 'form' branch
    // renders it), firing the mount effect's cleanup and tearing down the
    // Payment Element while confirmPayment() is still awaiting it. submitting
    // only disables the button; the form (and its mounted element) stays put
    // until the confirm call actually resolves.
    setSubmitting(true)
    try {
      const stripe = stripeRef.current
      const elements = elementsRef.current
      if (!stripe || !elements) throw new Error('Payment form not ready')

      // Carries the connected account id through the redirect — Stripe.js has
      // to be reloaded scoped to it on return (see the effect above), and
      // there's nowhere else to recover that id from a fresh page load.
      const returnUrl = new URL(window.location.href)
      if (stripeAccountIdRef.current) returnUrl.searchParams.set('sa', stripeAccountIdRef.current)

      const { error } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: returnUrl.toString() },
      })

      if (error) throw new Error(error.message ?? 'Payment failed')
      setStep('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Payment failed')
      setStep('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="flex items-center gap-2 px-5 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium">Payment successful! Thank you.</span>
      </div>
    )
  }

  if (step === 'pending') {
    return (
      <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-medium">Payment is processing — this page will update once it&apos;s confirmed.</span>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="space-y-3">
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{errorMsg}</div>
        <button onClick={() => setStep('idle')} className="text-sm text-gray-500 hover:text-gray-700">Try again</button>
      </div>
    )
  }

  if (step === 'form') {
    return (
      <div className="space-y-4">
        <div id="stripe-payment-element" className="p-4 border border-gray-200 rounded-xl bg-white" />
        <div className="flex gap-3">
          <button
            onClick={submitPayment}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pay now
          </button>
          <button onClick={() => setStep('idle')} disabled={submitting} className="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm disabled:opacity-60">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={startPayment}
      disabled={step === 'loading'}
      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
    >
      {step === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      Pay now
    </button>
  )
}
