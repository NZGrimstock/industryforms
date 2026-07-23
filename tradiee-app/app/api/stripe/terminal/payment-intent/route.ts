// POST /api/stripe/terminal/payment-intent { invoice_id, amount? }
//
// Creates a PaymentIntent intended for in-person collection via the Stripe
// Terminal SDK (Tap to Pay). Differs from the customer-pay flow in two ways:
//   • payment_method_types: ['card_present'] — Tap to Pay surfaces here.
//   • capture_method: 'automatic'              — confirm + capture in one step.
//
// The webhook (/api/stripe/webhook) already marks the invoice paid + fires
// the review-request email on payment_intent.succeeded, so the mobile side
// only needs to confirm via the SDK.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, stripeCurrency, connectOptions } from '@/lib/stripe'
import { hasPaidPlan } from '@/lib/billing'

const bodySchema = z.object({ invoice_id: z.string().uuid(), amount: z.number().positive().optional() })

// Platform risk limits for card-present collection. The platform is liable for
// connected-account negative balances (Express + direct charges), so these caps
// bound a single bad actor's exposure. Flat for now — override per-market via
// env; per-company tiers can come later if real volume needs them.
// ponytail: flat caps, add per-company tiers when there's volume to justify it.
const MAX_SINGLE = Number(process.env.TAP_TO_PAY_MAX_SINGLE ?? 10000) // per charge
const DAILY_CAP = Number(process.env.TAP_TO_PAY_DAILY_CAP ?? 25000)   // per company per UTC day

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  let { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const bearer = req.headers.get('authorization')
    if (bearer?.startsWith('Bearer ')) {
      const { data } = await createServiceClient().auth.getUser(bearer.slice(7))
      user = data.user
    }
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
  const { invoice_id, amount } = parsed.data

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id, is_super_admin').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: invoice } = await service
    .from('invoices')
    .select('id, company_id, total, amount_paid, invoice_number, companies(country, stripe_account_id, stripe_charges_enabled, subscription_status, billing_exempt)')
    .eq('id', invoice_id)
    .single()
  if (!invoice || invoice.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const company = invoice.companies as unknown as {
    country: string | null; stripe_account_id: string | null; stripe_charges_enabled: boolean | null
    subscription_status: string | null; billing_exempt: boolean | null
  } | null

  // Card-present collection is a paid-plan feature: a fraudster won't pay a
  // monthly subscription and wait, so this is the cheapest, strongest control
  // against throwaway bust-out accounts.
  if (!hasPaidPlan(!!profile.is_super_admin, company)) {
    return NextResponse.json(
      { error: 'Tap to Pay is available on a paid plan. Subscribe in Settings → Subscription to take card payments.' },
      { status: 403 }
    )
  }

  // Tap to Pay is a direct charge on the connected account — no platform
  // fallback (unlike online invoice pay / booking deposits), since a card-
  // present charge with no connected account has nowhere real to settle.
  const options = connectOptions(company)
  if (!options) {
    return NextResponse.json(
      { error: 'Complete payouts setup in Settings → Subscription before taking card payments.' },
      { status: 409 }
    )
  }

  const outstanding = Number(invoice.total) - Number(invoice.amount_paid)
  const requested = amount ? Number(amount) : outstanding
  const chargeAmount = Math.min(requested, outstanding)
  const cents = Math.round(chargeAmount * 100)
  if (cents <= 0) return NextResponse.json({ error: 'Nothing to charge' }, { status: 400 })

  // Risk caps. Per-charge kills a single large stolen-card tap; the daily cap
  // bounds a bust-out over the course of a day. Daily total sums *settled*
  // card payments today — a fraudster's charges settle in seconds so they show
  // up fast enough for a velocity backstop; the paid-plan gate is the primary
  // control. ponytail: settled-sum has a small in-flight gap, tighten only if abused.
  if (chargeAmount > MAX_SINGLE) {
    return NextResponse.json(
      { error: `This charge exceeds the ${MAX_SINGLE.toLocaleString()} single-payment limit. Contact support to raise it.` },
      { status: 400 }
    )
  }
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const { data: todaysPayments } = await service
    .from('payments')
    .select('amount, invoices!inner(company_id)')
    .eq('invoices.company_id', invoice.company_id)
    .eq('method', 'stripe')
    .gte('paid_at', dayStart.toISOString())
  const todayTotal = (todaysPayments ?? []).reduce((sum, p) => sum + Number((p as { amount: number }).amount), 0)
  if (todayTotal + chargeAmount > DAILY_CAP) {
    return NextResponse.json(
      { error: `This would exceed your ${DAILY_CAP.toLocaleString()} daily card-payment limit. Contact support to raise it.` },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  const pi = await stripe.paymentIntents.create({
    amount: cents,
    currency: stripeCurrency(company?.country),
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
    metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, channel: 'tap_to_pay' },
  }, options)

  return NextResponse.json({
    client_secret: pi.client_secret,
    id: pi.id,
    amount: cents,
  })
}
