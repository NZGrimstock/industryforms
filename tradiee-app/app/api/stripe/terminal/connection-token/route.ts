// POST /api/stripe/terminal/connection-token
//
// Issues a short-lived Stripe Terminal connection token to the mobile app.
// The Terminal SDK (Tap to Pay on iPhone / Android) calls this on every
// reader connection — never embed the secret key in the mobile bundle.
//
// Auth: any authenticated user (owner/admin/staff who can take a payment in
// the field). The token is scoped only to Terminal SDK operations.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, connectOptions } from '@/lib/stripe'

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

  const { data: profile } = await createServiceClient()
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: company } = await createServiceClient()
    .from('companies')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', profile.company_id)
    .single()

  // Direct-charge Terminal: the connection token, Location and reader must all
  // live on the connected account. Called eagerly on every app launch
  // (StripeTerminalInitializer), so this failing for a not-yet-onboarded
  // company is expected and silently caught there — it only surfaces to the
  // user when they actually try to take a payment on Pay Now.
  const options = connectOptions(company)
  if (!options) {
    return NextResponse.json(
      { error: 'Complete payouts setup in Settings → Subscription before taking card payments.' },
      { status: 409 }
    )
  }

  const stripe = getStripe()
  const token = await stripe.terminal.connectionTokens.create({}, options)
  return NextResponse.json({ secret: token.secret })
}
