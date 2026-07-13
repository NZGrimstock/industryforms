// Tap to Pay client wiring for the mobile app.
//
// Codex build audit marker (2026-07-07): Stripe Terminal RN SDK wiring landed
// here and in app/pay-now.tsx. iOS production still requires Apple's
// com.apple.developer.proximity-reader entitlement outside the codebase.
//
// Backend marks invoice paid + fires review-request via the existing
// payment_intent.succeeded webhook after the SDK confirms the PaymentIntent.
//
// Stripe Connect (2026-07-13): charges are now direct on each company's own
// connected account, so the Terminal Location is per-company, not a single
// global one — fetchTerminalLocationId() replaces the old static
// EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID env var. connection-token and
// payment-intent both 409 with a clear message if the company hasn't finished
// Connect onboarding yet (Settings → Subscription → Get paid).

import { supabase } from '@/lib/supabase'

export const TAP_TO_PAY_READY = true

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again before taking a payment.')
  return { Authorization: `Bearer ${session.access_token}` }
}

export async function fetchConnectionToken(apiBase: string): Promise<string> {
  const res = await fetch(`${apiBase}/api/stripe/terminal/connection-token`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Connection token failed')
  }
  const { secret } = await res.json()
  return secret as string
}

export async function fetchTerminalLocationId(apiBase: string): Promise<string> {
  const res = await fetch(`${apiBase}/api/stripe/terminal/location`, {
    method: 'GET',
    headers: await authHeaders(),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Could not resolve a Terminal location')
  }
  const { location_id } = await res.json()
  return location_id as string
}

export async function fetchTerminalPaymentIntent(apiBase: string, invoiceId: string, amount?: number) {
  const res = await fetch(`${apiBase}/api/stripe/terminal/payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ invoice_id: invoiceId, amount }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'PaymentIntent failed')
  }
  return res.json() as Promise<{ client_secret: string; id: string; amount: number }>
}
