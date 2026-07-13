import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { maybeSendReviewRequest } from '@/lib/review-request'
import { BILLING_ADDONS, type BillingAddonSlug, setAddonActive } from '@/lib/billing'
import { createJobFromBooking } from '@/lib/bookings/fulfill'
import { sendBookingConfirmationEmail } from '@/lib/bookings/notify'

type InvoicePaymentResult = {
  applied: boolean
  invoice_status: string
  invoice_amount_paid: number
}

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
      const bookingId = pi.metadata?.booking_id
      if (bookingId) {
        await handleBookingDepositPaid(service, bookingId, pi)
        break
      }
      const invoiceId = pi.metadata?.invoice_id
      if (!invoiceId) break

      const amount = (pi.amount_received || pi.amount) / 100
      const { data: paymentResult, error: paymentError } = await service
        .rpc('record_stripe_invoice_payment', {
          p_invoice_id: invoiceId,
          p_payment_intent_id: pi.id,
          p_amount: amount,
          p_paid_at: new Date().toISOString(),
        })
        .single()
      if (paymentError) {
        console.error('[stripe-webhook] invoice payment settlement failed', paymentError)
        break
      }
      const settledPayment = paymentResult as InvoicePaymentResult | null

      if (settledPayment?.applied && settledPayment.invoice_status === 'paid') {
        await maybeSendReviewRequest(service, invoiceId)
      }
      break
    }

    case 'account.updated': {
      // Connect (Express) onboarding progress — keep the company's capability
      // flags in sync so Settings reflects reality without polling.
      const account = event.data.object as Stripe.Account
      await service
        .from('companies')
        .update({
          stripe_charges_enabled: !!account.charges_enabled,
          stripe_payouts_enabled: !!account.payouts_enabled,
          stripe_details_submitted: !!account.details_submitted,
        })
        .eq('stripe_account_id', account.id)
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const stripeCustomerId = sub.customer as string
      const status = sub.status

      // Codex build audit marker (2026-07-08): paid add-ons are separate Stripe
      // subscriptions tagged with metadata.addon; webhook state owns access.
      if (isBillingAddon(sub.metadata?.addon)) {
        const active = status === 'active' || status === 'trialing'
        const companyId = sub.metadata.company_id || await findCompanyIdForCustomer(service, stripeCustomerId)
        if (companyId) {
          await setAddonActive(service, companyId, sub.metadata.addon, active, {
            stripe_subscription_id: sub.id,
            stripe_status: status,
          })
        } else {
          console.error('[stripe-webhook] add-on subscription missing company_id', { subscription: sub.id, addon: sub.metadata.addon })
        }
        break
      }

      const plan = (sub.items.data[0]?.price?.lookup_key ?? 'solo').split('_')[0]
      await service.from('companies').update({
        subscription_status: status,
        subscription_plan: plan,
        stripe_subscription_id: sub.id,
        trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      }).eq('stripe_customer_id', stripeCustomerId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      if (isBillingAddon(sub.metadata?.addon)) {
        const companyId = sub.metadata.company_id || await findCompanyIdForCustomer(service, sub.customer as string)
        if (companyId) {
          await setAddonActive(service, companyId, sub.metadata.addon, false, {
            stripe_subscription_id: sub.id,
            stripe_status: sub.status,
          })
        } else {
          console.error('[stripe-webhook] deleted add-on subscription missing company_id', { subscription: sub.id, addon: sub.metadata.addon })
        }
        break
      }
      await service.from('companies').update({
        subscription_status: 'canceled',
        subscription_plan: 'trial',
        stripe_subscription_id: null,
      }).eq('stripe_customer_id', sub.customer as string)
      break
    }
  }

  return NextResponse.json({ received: true })
}

function isBillingAddon(slug: string | undefined): slug is BillingAddonSlug {
  return !!slug && slug in BILLING_ADDONS
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findCompanyIdForCustomer(service: any, stripeCustomerId: string): Promise<string | null> {
  const { data } = await service.from('companies').select('id').eq('stripe_customer_id', stripeCustomerId).maybeSingle()
  return data?.id ?? null
}

// Idempotent under Stripe retries: every write is guarded by the booking's
// current status, so replaying the same event after the first success is a
// no-op (status is no longer 'deposit_pending', job_id is already set).
async function handleBookingDepositPaid(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  bookingId: string,
  pi: Stripe.PaymentIntent
) {
  const { data: booking } = await service.from('bookings')
    .select('id, status, company_id, customer_id, package_id, assigned_to, customer_email, customer_phone, customer_name, site_address, starts_at, ends_at, job_id')
    .eq('id', bookingId).single()
  if (!booking || booking.status !== 'deposit_pending') return

  const amount = pi.amount / 100
  await service.from('bookings').update({
    deposit_paid: amount,
    status: 'confirmed',
    updated_at: new Date().toISOString(),
  }).eq('id', bookingId).eq('status', 'deposit_pending')

  const { data: pkg } = await service.from('bookable_packages')
    .select('name, creates_job').eq('id', booking.package_id).single()

  if (!booking.job_id && pkg?.creates_job) {
    await createJobFromBooking(service, booking, pkg.name)
  }

  await sendBookingConfirmationEmail(service, booking.company_id, booking, pkg?.name ?? 'Booking')
}
