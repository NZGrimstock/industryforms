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
