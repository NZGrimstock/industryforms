// GET /api/bookings/resolve-deposit-intent?pi=<paymentIntentId>&sa=<stripeAccountId?>
//
// Public. Used by the booking widget after a 3D Secure redirect to recover
// which booking a PaymentIntent belongs to and its live status. Stripe.js
// doesn't expose PaymentIntent.metadata to client-side retrieval (by design
// — only the fields safe to hand to a browser holding just the publishable
// key), so the lookup has to go through the server, which has full access
// via the secret key.
import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

export async function GET(req: NextRequest) {
  const paymentIntentId = req.nextUrl.searchParams.get('pi')
  const stripeAccountId = req.nextUrl.searchParams.get('sa')
  if (!paymentIntentId) return NextResponse.json({ error: 'Missing pi' }, { status: 400 })

  try {
    const stripe = getStripe()
    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId, undefined, stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    )
    const bookingId = typeof paymentIntent.metadata?.booking_id === 'string' ? paymentIntent.metadata.booking_id : null
    if (!bookingId) return NextResponse.json({ error: 'Not a booking payment' }, { status: 404 })

    return NextResponse.json({ bookingId, amount: paymentIntent.amount, status: paymentIntent.status })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not resolve payment' }, { status: 502 })
  }
}
