// POST /api/bookings/deposit-intent — public. Creates a Stripe PaymentIntent
// for a booking's deposit and stores the intent id on the booking immediately
// (before payment completes) so the webhook can find it later — mirrors
// app/api/stripe/payment-intent/route.ts for invoices.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe, stripeCurrency } from '@/lib/stripe'

const bodySchema = z.object({ bookingId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
  const { bookingId } = parsed.data

  const service = createServiceClient()
  const { data: booking } = await service.from('bookings')
    .select('id, status, deposit_required, deposit_paid, company_id, companies(name, country)')
    .eq('id', bookingId).single()

  if (!booking || booking.status !== 'deposit_pending') {
    return NextResponse.json({ error: 'Booking is not awaiting a deposit' }, { status: 400 })
  }
  const amountDue = Math.round((Number(booking.deposit_required) - Number(booking.deposit_paid)) * 100)
  if (amountDue <= 0) return NextResponse.json({ error: 'Deposit already paid' }, { status: 400 })

  const company = booking.companies as unknown as { name: string; country: string | null } | null
  const stripe = getStripe()
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountDue,
    currency: stripeCurrency(company?.country),
    metadata: { booking_id: booking.id },
    description: `Booking deposit — ${company?.name ?? ''}`,
  })

  await service.from('bookings').update({ stripe_payment_intent_id: paymentIntent.id }).eq('id', bookingId)

  return NextResponse.json({ clientSecret: paymentIntent.client_secret })
}
