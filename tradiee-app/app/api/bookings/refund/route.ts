// POST /api/bookings/refund { bookingId }
//
// Deposit refund policy (decided 2026-07-04): full refund if cancelled more
// than 24h before starts_at; forfeited for a late cancellation or no-show.
// Admin-triggered only — never auto-refunded on cancellation.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, connectOptions } from '@/lib/stripe'

const REFUND_WINDOW_HOURS = 24
const bodySchema = z.object({ bookingId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
  const { bookingId } = parsed.data

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data: booking } = await service.from('bookings')
    .select('id, company_id, status, starts_at, deposit_paid, deposit_refunded, stripe_payment_intent_id, companies(stripe_account_id, stripe_charges_enabled)')
    .eq('id', bookingId).single()
  if (!booking || booking.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!['cancelled', 'no_show'].includes(booking.status)) {
    return NextResponse.json({ error: 'Booking must be cancelled or marked no-show first' }, { status: 400 })
  }

  const refundable = Number(booking.deposit_paid) - Number(booking.deposit_refunded)
  if (refundable <= 0) return NextResponse.json({ error: 'Nothing left to refund' }, { status: 400 })
  if (!booking.stripe_payment_intent_id) return NextResponse.json({ error: 'No payment on record' }, { status: 400 })

  const hoursBeforeStart = (new Date(booking.starts_at).getTime() - Date.now()) / 3600000
  if (booking.status === 'no_show' || hoursBeforeStart < REFUND_WINDOW_HOURS) {
    return NextResponse.json({ error: `Deposit is forfeited — refund only allowed for a cancellation more than ${REFUND_WINDOW_HOURS}h before the booking` }, { status: 400 })
  }

  const stripe = getStripe()
  const company = booking.companies as unknown as { stripe_account_id: string | null; stripe_charges_enabled: boolean | null } | null
  // The deposit was charged with connectOptions(company) (see deposit-intent/route.ts) —
  // a Connect-onboarded company's PaymentIntent lives on the connected account, so the
  // refund must be scoped there too or Stripe returns "No such payment_intent".
  await stripe.refunds.create({
    payment_intent: booking.stripe_payment_intent_id,
    amount: Math.round(refundable * 100),
  }, connectOptions(company))

  await service.from('bookings').update({
    deposit_refunded: Number(booking.deposit_refunded) + refundable,
    updated_at: new Date().toISOString(),
  }).eq('id', bookingId)

  return NextResponse.json({ ok: true })
}
