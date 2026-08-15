// POST /api/invoices/[id]/credit { amount, outcome: 'refund' | 'account_credit', reason? }
//
// Issues a credit note against a sent/paid/partially_paid/overdue invoice.
// `amount` is GST-inclusive throughout this feature (matches invoice.total
// and what a Stripe refund actually moves) — never the excl.-GST subtotal.
//
// Two outcomes:
//   'refund'         — money actually moves, right now, via Stripe. Bounded
//                       by what was genuinely collected via Stripe on this
//                       invoice (a bank-transfer/cash payment has no Stripe
//                       transaction to reverse).
//   'account_credit' — no money moves. Creates a spendable balance against
//                       the customer, applied later via
//                       POST /api/invoices/[id]/apply-credit.
//
// Owner/admin only — matches the RLS on credit_notes itself, re-checked here
// because this route uses the service client, which bypasses RLS entirely.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { getStripe, connectOptions } from '@/lib/stripe'
import { maxCreditableAmount, maxRefundableAmount } from '@/lib/credit-notes'

const bodySchema = z.object({
  amount: z.number().positive(),
  outcome: z.enum(['refund', 'account_credit']),
  reason: z.string().trim().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only an owner or admin can credit an invoice.' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { amount, outcome, reason } = parsed.data

  const service = createServiceClient()
  const { data: invoice } = await service
    .from('invoices')
    .select('id, company_id, customer_id, invoice_number, status, total, companies(country, stripe_account_id, stripe_charges_enabled)')
    .eq('id', id)
    .single()
  if (!invoice || invoice.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (invoice.status === 'draft' || invoice.status === 'void') {
    return NextResponse.json({ error: `A ${invoice.status} invoice can't be credited — it was never issued to the customer.` }, { status: 400 })
  }

  const { data: priorCredits } = await service
    .from('credit_notes')
    .select('amount')
    .eq('source_invoice_id', id)
    .neq('status', 'void')
  const alreadyCredited = (priorCredits ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
  const creditable = maxCreditableAmount(Number(invoice.total), alreadyCredited)
  if (amount > creditable + 0.01) {
    return NextResponse.json({ error: `Only $${creditable.toFixed(2)} of this invoice can still be credited.` }, { status: 400 })
  }

  let stripeRefundId: string | null = null

  if (outcome === 'refund') {
    const { data: stripePayments } = await service
      .from('payments')
      .select('amount, stripe_payment_intent_id')
      .eq('invoice_id', id)
      .eq('method', 'stripe')
      .not('stripe_payment_intent_id', 'is', null)
    const { data: priorRefunds } = await service
      .from('credit_notes')
      .select('amount')
      .eq('source_invoice_id', id)
      .eq('outcome', 'refund')
      .neq('status', 'void')
    const stripePaidTotal = (stripePayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
    const alreadyRefunded = (priorRefunds ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
    const refundable = maxRefundableAmount(stripePaidTotal, alreadyRefunded)
    if (amount > refundable + 0.01) {
      return NextResponse.json({
        error: refundable <= 0.01
          ? 'Nothing on this invoice was paid via Stripe — issue an account credit instead.'
          : `Only $${refundable.toFixed(2)} of this invoice was paid via Stripe and can be refunded that way.`,
      }, { status: 400 })
    }

    const company = invoice.companies as unknown as { country: string | null; stripe_account_id: string | null; stripe_charges_enabled: boolean | null } | null
    const options = connectOptions(company)
    const stripe = getStripe()

    // A refund can span more than one Stripe payment on this invoice (e.g. a
    // deposit + balance, paid separately) — cover the requested amount by
    // refunding each payment in order rather than assuming there's only one.
    let remaining = Math.round(amount * 100)
    const refundIds: string[] = []
    for (const payment of stripePayments ?? []) {
      if (remaining <= 0) break
      const cents = Math.round(Math.min(Number(payment.amount) * 100, remaining))
      if (cents <= 0) continue
      try {
        const refund = await stripe.refunds.create(
          { payment_intent: payment.stripe_payment_intent_id!, amount: cents },
          options
        )
        refundIds.push(refund.id)
        remaining -= cents
      } catch (e) {
        console.error('Credit-note refund error:', e)
        return NextResponse.json({
          error: e instanceof Error ? e.message : 'Stripe refund failed partway through — check Stripe before retrying, some payments may have been refunded.',
        }, { status: 502 })
      }
    }
    stripeRefundId = refundIds.join(',')
  }

  const { data: creditNote, error } = await service
    .from('credit_notes')
    .insert({
      company_id: invoice.company_id,
      customer_id: invoice.customer_id,
      source_invoice_id: id,
      amount,
      outcome,
      reason: reason || null,
      stripe_refund_id: stripeRefundId,
      created_by: auth.userId,
    })
    .select('id, credit_note_number, amount, outcome, status, reason, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, creditNote })
}
