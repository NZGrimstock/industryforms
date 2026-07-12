import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id, companies!company_id(stripe_customer_id)').eq('id', user.id).single()

  const stripeCustomerId = (profile?.companies as unknown as { stripe_customer_id: string | null } | null)?.stripe_customer_id
  if (!stripeCustomerId) return NextResponse.json({ error: 'No billing account found' }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings`,
  })

  return NextResponse.json({ url: session.url })
}
