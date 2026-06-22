// POST /api/stripe/terminal/connection-token
//
// Issues a short-lived Stripe Terminal connection token to the mobile app.
// The Terminal SDK (Tap to Pay on iPhone / Android) calls this on every
// reader connection — never embed the secret key in the mobile bundle.
//
// Auth: any authenticated user (owner/admin/staff who can take a payment in
// the field). The token is scoped only to Terminal SDK operations.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stripe = getStripe()
  const token = await stripe.terminal.connectionTokens.create()
  return NextResponse.json({ secret: token.secret })
}
