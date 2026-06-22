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
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invoice_id, amount } = await req.json().catch(() => ({}))
  if (!invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const service = createServiceClient()
  const { data: invoice } = await service
    .from('invoices')
    .select('id, company_id, total, amount_paid, invoice_number')
    .eq('id', invoice_id)
    .single()
  if (!invoice || invoice.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const outstanding = Number(invoice.total) - Number(invoice.amount_paid)
  const cents = Math.round((amount ? Number(amount) : outstanding) * 100)
  if (cents <= 0) return NextResponse.json({ error: 'Nothing to charge' }, { status: 400 })

  const stripe = getStripe()
  const pi = await stripe.paymentIntents.create({
    amount: cents,
    currency: 'nzd',
    payment_method_types: ['card_present'],
    capture_method: 'automatic',
    metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, channel: 'tap_to_pay' },
  })

  return NextResponse.json({
    client_secret: pi.client_secret,
    id: pi.id,
    amount: cents,
  })
}
