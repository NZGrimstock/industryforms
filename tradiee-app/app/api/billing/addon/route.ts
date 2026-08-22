/**
 * POST /api/billing/addon
 * Enable or disable a paid add-on for the caller's company. Owners/admins only.
 * Codex build audit marker (2026-07-08): production add-ons now use Stripe
 * Checkout/Portal and the Stripe webhook is the source of truth. Super-admins
 * and billing-exempt review accounts keep the direct path because they do not
 * enter Stripe billing.
 */
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveCompanyUser } from '@/lib/api-auth'
import { BILLING_ADDONS, type BillingAddonSlug, setAddonActive, effectivePlanKey } from '@/lib/billing'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  slug: z.enum(['projects', 'bookings_website', 'sms_usage']),
  active: z.boolean().optional(),
})

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Unknown add-on' }, { status: 400 })
  const { slug, active = true } = parsed.data
  const addon = BILLING_ADDONS[slug as BillingAddonSlug]

  const svc = createServiceClient()
  const { data: caller } = await svc.from('profiles').select('role, is_super_admin').eq('id', auth.userId).single()
  if (!caller || (!caller.is_super_admin && caller.role !== 'owner' && caller.role !== 'admin')) {
    return NextResponse.json({ error: 'Only owners or admins can change add-ons.' }, { status: 403 })
  }

  const { data: company } = await svc
    .from('companies')
    .select('name, billing_exempt, stripe_customer_id, addons, subscription_plan, subscription_status, trial_ends_at, comp_plan, comp_until')
    .eq('id', auth.companyId)
    .single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  // Projects (which also unlocks the plan-takeoff tool) is sold as Team+
  // only: Pro has it bundled (hasAddon() in lib/billing.ts grants it without
  // this flag), Team can buy it for $19/mo, nothing below Team can buy it at
  // all — no point letting a Solo/free/trial company pay for an add-on that
  // still wouldn't unlock anything without also being on Team.
  if (slug === 'projects' && active !== false && !caller.is_super_admin && !company.billing_exempt) {
    const plan = effectivePlanKey(company)
    if (plan === 'pro') return NextResponse.json({ error: 'Projects is already included on your Pro plan.' }, { status: 400 })
    if (plan !== 'team') return NextResponse.json({ error: 'Projects requires the Team plan or higher — upgrade first.' }, { status: 403 })
  }

  if (caller.is_super_admin || company.billing_exempt) {
    await setAddonActive(svc, auth.companyId, slug, active)
    return NextResponse.json({ ok: true, slug, active, monthly: addon.monthly, direct: true })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const stripe = getStripe()
  let stripeCustomerId = company.stripe_customer_id as string | null
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: company.name ?? undefined,
      metadata: { company_id: auth.companyId },
    })
    stripeCustomerId = customer.id
    await svc.from('companies').update({ stripe_customer_id: stripeCustomerId }).eq('id', auth.companyId)
  }

  if (active === false) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: buildReturnUrl(appUrl, '/settings', { tab: 'subscription' }),
    })
    return NextResponse.json({ ok: true, slug, active: false, url: portal.url })
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: await getPriceId(addon.lookupKey), quantity: 1 }],
    success_url: buildReturnUrl(appUrl, addon.returnPath, { subscribed: '1' }),
    cancel_url: new URL(addon.returnPath, appUrl).toString(),
    allow_promotion_codes: true,
    subscription_data: { metadata: { company_id: auth.companyId, addon: slug } },
  })

  return NextResponse.json({ ok: true, slug, active: true, monthly: addon.monthly, url: session.url })
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
