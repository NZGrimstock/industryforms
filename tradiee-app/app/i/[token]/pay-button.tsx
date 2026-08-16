'use client'
import { useEffect, useRef, useState } from 'react'
import { CreditCard, Loader2, CheckCircle } from 'lucide-react'
import type { Stripe, StripeElements } from '@stripe/stripe-js'

export function PayNowButton({ token, amountDue }: { token: string; amountDue: number }) {
  const [step, setStep] = useState<'idle' | 'loading' | 'form' | 'processing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const stripeRef = useRef<Stripe | null>(null)
  const elementsRef = useRef<StripeElements | null>(null)

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
    setStep('processing')
    try {
      const stripe = stripeRef.current
      const elements = elementsRef.current
      if (!stripe || !elements) throw new Error('Payment form not ready')

      const { error } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      })

      if (error) throw new Error(error.message ?? 'Payment failed')
      setStep('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Payment failed')
      setStep('error')
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
            className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Pay now
          </button>
          <button onClick={() => setStep('idle')} className="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={startPayment}
      disabled={step === 'loading' || step === 'processing'}
      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
    >
      {(step === 'loading' || step === 'processing') ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      Pay now
    </button>
  )
}
