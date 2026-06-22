/**
 * POST /api/billing/addon
 * Enable or disable a paid add-on for the caller's company. Owners/admins only.
 *
 * In production, this would create a Stripe Checkout/Portal session for the
 * add-on price; the Stripe webhook is the source of truth. Until STRIPE_* env
 * vars are real, we flip the flag directly so the feature is testable end-to-
 * end. Super-admins / billing-exempt accounts already get add-ons for free
 * via lib/billing.ts → hasAddon().
 */
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'

const KNOWN: Record<string, { monthly: number; label: string }> = {
  projects: { monthly: 19, label: 'Projects' },
  website:  { monthly: 9,  label: 'Instant Website' },
}

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug, active } = await req.json() as { slug?: string; active?: boolean }
  if (!slug || !KNOWN[slug]) return NextResponse.json({ error: 'Unknown add-on' }, { status: 400 })

  const svc = createServiceClient()
  const { data: caller } = await svc.from('profiles').select('role').eq('id', auth.userId).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
    return NextResponse.json({ error: 'Only owners or admins can change add-ons.' }, { status: 403 })
  }

  const { data: company } = await svc.from('companies').select('addons').eq('id', auth.companyId).single()
  const addons = { ...((company?.addons ?? {}) as Record<string, { active?: boolean }>) }
  addons[slug] = { active: active !== false }

  const { error } = await svc.from('companies').update({ addons }).eq('id', auth.companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, slug, active: addons[slug].active, monthly: KNOWN[slug].monthly })
}
