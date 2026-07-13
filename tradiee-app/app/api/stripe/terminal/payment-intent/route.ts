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
import { getStripe, stripeCurrency } from '@/lib/stripe'

const bodySchema = z.object({ invoice_id: z.string().uuid(), amount: z.number().positive().optional() })

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
  const { data: profile } = await service.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: invoice } = await service
    .from('invoices')
    .select('id, company_id, total, amount_paid, invoice_number, companies(country)')
    .eq('id', invoice_id)
    .single()
  if (!invoice || invoice.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const company = invoice.companies as unknown as { country: string | null } | null

  const outstanding = Number(invoice.total) - Number(invoice.amount_paid)
  const requested = amount ? Number(amount) : outstanding
  const chargeAmount = Math.min(requested, outstanding)
  const cents = Math.round(chargeAmount * 100)
  if (cents <= 0) return NextResponse.json({ error: 'Nothing to charge' }, { status: 400 })

  const stripe = getStripe()
  const pi = await stripe.paymentIntents.create({
    amount: cents,
    currency: stripeCurrency(company?.country),
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
