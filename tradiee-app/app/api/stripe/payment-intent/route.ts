import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe, stripeCurrency, connectOptions, getOrCreatePaymentIntent } from '@/lib/stripe'

const bodySchema = z.object({ token: z.string().trim().min(1).max(200) })

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  const { token } = parsed.data

  const service = createServiceClient()
  const { data: invoice } = await service
    .from('invoices')
    .select('id, total, amount_paid, invoice_number, company_id, stripe_payment_intent_id, companies(name, stripe_customer_id, country, stripe_account_id, stripe_charges_enabled)')
    .eq('public_token', token)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const amountDue = Math.round((Number(invoice.total) - Number(invoice.amount_paid)) * 100)
  if (amountDue <= 0) return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 })

  const company = invoice.companies as unknown as {
    name: string; country: string | null; stripe_account_id: string | null; stripe_charges_enabled: boolean | null
  } | null

  // Direct charge on the company's connected account once they've completed
  // Connect onboarding; falls back to the platform account (today's behaviour)
  // otherwise, so this public pay page never breaks for a not-yet-onboarded
  // company. See lib/stripe.ts connectOptions.
  const options = connectOptions(company)
  const paymentIntent = await getOrCreatePaymentIntent(stripe, options, invoice.stripe_payment_intent_id, {
    amount: amountDue,
    currency: stripeCurrency(company?.country),
    // Card only — the Stripe account's automatic payment methods otherwise
    // surface Klarna/Link (BNPL) on trade invoices, which we don't want.
    payment_method_types: ['card'],
    metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
    description: `Invoice ${invoice.invoice_number} — ${company?.name ?? ''}`,
  })

  if (paymentIntent.id !== invoice.stripe_payment_intent_id) {
    await service.from('invoices').update({ stripe_payment_intent_id: paymentIntent.id }).eq('id', invoice.id)
  }

  // A direct-charge client_secret only resolves through Stripe.js when it's
  // loaded scoped to the same connected account (loadStripe(pk, { stripeAccount })) —
  // otherwise the Payment Element mounts with nothing in it, since it can't
  // see a PaymentIntent that lives on an account it wasn't told about.
  return NextResponse.json({ clientSecret: paymentIntent.client_secret, stripeAccountId: options?.stripeAccount ?? null })
}
