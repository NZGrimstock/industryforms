import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { maybeSendReviewRequest } from '@/lib/review-request'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  const service = createServiceClient()

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const invoiceId = pi.metadata?.invoice_id
      if (!invoiceId) break

      const { data: inv } = await service.from('invoices').select('total, amount_paid').eq('id', invoiceId).single()
      if (!inv) break

      const amount = pi.amount / 100
      const newPaid = Number(inv.amount_paid) + amount
      const newStatus = newPaid >= Number(inv.total) ? 'paid' : 'partially_paid'

      await service.from('payments').insert({
        invoice_id: invoiceId,
        amount,
        method: 'stripe',
        notes: `Stripe payment ${pi.id}`,
        paid_at: new Date().toISOString(),
      })

      await service.from('invoices').update({
        amount_paid: newPaid,
        status: newStatus,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
      }).eq('id', invoiceId)

      if (newStatus === 'paid') await maybeSendReviewRequest(service, invoiceId)
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const stripeCustomerId = sub.customer as string
      const status = sub.status

      // The Website add-on is a separate subscription — gate publishing, don't
      // touch the company's main plan.
      if (sub.metadata?.addon === 'website') {
        const active = status === 'active' || status === 'trialing'
        await service.from('company_websites').update({ subscription_active: active })
          .eq('company_id', sub.metadata.company_id)
        break
      }

      const plan = (sub.items.data[0]?.price?.lookup_key ?? 'solo').split('_')[0]
      await service.from('companies').update({
        subscription_status: status,
        subscription_plan: plan,
        trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      }).eq('stripe_customer_id', stripeCustomerId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      if (sub.metadata?.addon === 'website') {
        await service.from('company_websites').update({ subscription_active: false })
          .eq('company_id', sub.metadata.company_id)
        break
      }
      await service.from('companies').update({
        subscription_status: 'canceled',
        subscription_plan: 'trial',
      }).eq('stripe_customer_id', sub.customer as string)
      break
    }
  }

  return NextResponse.json({ received: true })
}
