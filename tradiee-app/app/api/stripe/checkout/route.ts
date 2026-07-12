import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { BILLING_ADDONS, type BillingAddonSlug } from '@/lib/billing'

const bodySchema = z.object({ plan: z.enum(['solo', 'team', 'pro', 'bookings_website', 'projects', 'sms_usage']) })
const MAIN_PLANS = new Set(['solo', 'team', 'pro'])

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
  const { plan } = parsed.data
  const service = createServiceClient()

  const { data: profile } = await service.from('profiles').select('company_id, email, full_name, companies!company_id(name, stripe_customer_id)').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const company = profile.companies as unknown as { name: string; stripe_customer_id: string | null } | null
  let stripeCustomerId = company?.stripe_customer_id

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      name: company?.name ?? profile.full_name,
      metadata: { company_id: profile.company_id },
    })
    stripeCustomerId = customer.id
    await service.from('companies').update({ stripe_customer_id: stripeCustomerId }).eq('id', profile.company_id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Codex build audit marker (2026-07-08): checkout supports main plans plus
  // Stripe-owned add-ons; webhooks are the source of truth for add-on access.
  const isAddon = !MAIN_PLANS.has(plan)
  const addon = isAddon ? BILLING_ADDONS[plan as BillingAddonSlug] : null
  const priceKey = addon?.lookupKey ?? `${plan}_monthly`
  const returnPath = addon?.returnPath ?? '/settings'
  const successUrl = buildReturnUrl(appUrl, returnPath, { subscribed: '1' })

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: await getPriceId(priceKey), quantity: 1 }],
    success_url: successUrl,
    cancel_url: `${appUrl}${returnPath}`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: {
        company_id: profile.company_id,
        ...(addon ? { addon: plan } : {}),
      },
    },
  })

  return NextResponse.json({ url: session.url })
}

async function getPriceId(lookupKey: string): Promise<string> {
  const prices = await getStripe().prices.list({ lookup_keys: [lookupKey], limit: 1 })
  if (!prices.data[0]) throw new Error(`Price not found for key: ${lookupKey}. Create it in Stripe dashboard.`)
  return prices.data[0].id
}

function buildReturnUrl(appUrl: string, path: string, params: Record<string, string>) {
  const url = new URL(path, appUrl)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}
