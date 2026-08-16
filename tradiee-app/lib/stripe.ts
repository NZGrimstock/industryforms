import Stripe from 'stripe'

// Lazy Stripe client — instantiating at module load would throw during `next build`
// (page-data collection) whenever STRIPE_SECRET_KEY isn't set, e.g. on a deploy that
// hasn't enabled billing yet. Created on first use inside a request instead.
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)')
    _stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
  }
  return _stripe
}

// Charge in the company's own currency. Companies are NZ or AU (companies.country);
// anything else (or unset) falls back to NZD — the app's primary market.
export function stripeCurrency(country?: string | null): 'nzd' | 'aud' {
  return country === 'AU' ? 'aud' : 'nzd'
}

export type ConnectCompany = { stripe_account_id?: string | null; stripe_charges_enabled?: boolean | null }

// Direct-charge request options — passing these makes the PaymentIntent live
// on the connected account, so funds settle straight to the tradie's own bank
// account (no application fee; IndustryForms monetises via subscriptions).
// Returns undefined (today's platform-account charge) until the company has
// completed Stripe Connect onboarding, so live customer-facing pay pages never
// break for a company that hasn't set up payouts yet — see lib/connect.ts.
export function connectOptions(company: ConnectCompany | null | undefined): Stripe.RequestOptions | undefined {
  if (company?.stripe_account_id && company.stripe_charges_enabled) {
    return { stripeAccount: company.stripe_account_id }
  }
  return undefined
}

// PaymentIntents safe to hand back for a fresh confirmation attempt.
// Deliberately excludes 'processing' — Stripe rejects confirming a
// PaymentIntent that's already processing, so reusing one there would hand
// the client a clientSecret that's guaranteed to fail on submit. Anything
// terminal (succeeded, canceled) needs a fresh PaymentIntent regardless.
const OPEN_PAYMENT_INTENT_STATUSES: Stripe.PaymentIntent.Status[] = [
  'requires_payment_method', 'requires_confirmation', 'requires_action',
]

// Reuse an already-open PaymentIntent instead of creating a new one on every
// "Pay now" click. Without this, a page reload or a 3DS challenge that gets
// abandoned mid-flow orphans a fresh PaymentIntent per attempt — same invoice,
// several live intents, only one of which the customer might actually finish.
// Reusing means retrying always resumes the same intent (and its clientSecret
// keeps working after a redirect back), and it keeps the amount in sync if it
// changed between attempts (e.g. a partial payment landed in between).
export async function getOrCreatePaymentIntent(
  stripe: Stripe,
  requestOptions: Stripe.RequestOptions | undefined,
  existingId: string | null | undefined,
  params: Stripe.PaymentIntentCreateParams
): Promise<Stripe.PaymentIntent> {
  if (existingId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(existingId, undefined, requestOptions)
      if (OPEN_PAYMENT_INTENT_STATUSES.includes(existing.status)) {
        return existing.amount === params.amount
          ? existing
          : await stripe.paymentIntents.update(existingId, { amount: params.amount }, requestOptions)
      }
    } catch {
      // Not found / wrong mode / wrong account — fall through and create fresh.
    }
  }
  return stripe.paymentIntents.create(params, requestOptions)
}
