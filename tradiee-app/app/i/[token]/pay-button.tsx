'use client'
import { useState } from 'react'
import { CreditCard, Loader2, CheckCircle } from 'lucide-react'

export function PayNowButton({ token, amountDue }: { token: string; amountDue: number }) {
  const [step, setStep] = useState<'idle' | 'loading' | 'form' | 'processing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function openPayment() {
    setStep('loading')
    try {
      const res = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? 'Failed to initialize payment')

      const { loadStripe } = await import('@stripe/stripe-js')
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
      if (!stripe) throw new Error('Stripe failed to load')

      const { error } = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: await getCardElement(stripe) },
      })

      if (error) throw new Error(error.message ?? 'Payment failed')
      setStep('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Payment failed')
      setStep('error')
    }
  }

  // Simple card collection using Stripe Elements redirect approach
  async function getCardElement(stripe: import('@stripe/stripe-js').Stripe) {
    throw new Error('Use checkout redirect instead')
    // Prevent lint error — handled below via checkout
    return {} as never
  }

  async function redirectToCheckout() {
    setStep('processing')
    try {
      const res = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')

      const { loadStripe } = await import('@stripe/stripe-js')
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
      if (!stripe) throw new Error('Stripe failed to load')

      const elements = stripe.elements({ clientSecret: data.clientSecret, appearance: { theme: 'stripe' } })
      const paymentEl = elements.create('payment')

      // Mount into a div we'll show inline
      setStep('form')
      // Store for later submission — confirmPayment() must be called on this
      // same Stripe instance, not a freshly loaded one, or Stripe.js rejects
      // the elements as belonging to a different instance.
      const w = window as Window & { __stripe?: typeof stripe; __stripeElements?: typeof elements; __stripeEl?: typeof paymentEl }
      w.__stripe = stripe
      w.__stripeElements = elements
      w.__stripeEl = paymentEl

      setTimeout(() => {
        const mount = document.getElementById('stripe-payment-element')
        if (mount) paymentEl.mount('#stripe-payment-element')
      }, 50)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load payment form')
      setStep('error')
    }
  }

  async function submitPayment() {
    setStep('processing')
    try {
      const w = window as Window & { __stripe?: import('@stripe/stripe-js').Stripe; __stripeElements?: import('@stripe/stripe-js').StripeElements }
      const stripe = w.__stripe
      if (!stripe || !w.__stripeElements) throw new Error('Payment form not ready')

      const { error } = await stripe.confirmPayment({
        elements: w.__stripeElements,
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
      onClick={redirectToCheckout}
      disabled={step === 'loading' || step === 'processing'}
      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
    >
      {(step === 'loading' || step === 'processing') ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
      Pay now
    </button>
  )
}
