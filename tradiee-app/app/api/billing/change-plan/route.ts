/**
 * POST /api/billing/change-plan
 * Switch the caller's company to a new subscription plan. Owner/admin only.
 *
 * In production this would hit Stripe to update the subscription; until the
 * STRIPE_* env vars are real (placeholders today), we just update the DB so
 * the seat caps in the app reflect the new tier. The /upgrade screen still
 * owns the actual payment flow.
 */
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getPlan, type PlanKey } from '@/lib/plans'

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json() as { plan?: PlanKey }
  if (!plan) return NextResponse.json({ error: 'plan required' }, { status: 400 })
  // 'free' is a derived floor (see effectivePlanKey() in lib/billing.ts), never
  // a real subscription state — it must never be written to subscription_plan,
  // and this route has no Stripe call to actually downgrade a paying company.
  if (plan === 'free') return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
  const target = getPlan(plan)
  if (target.key !== plan) return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })

  const svc = createServiceClient()
  // Owner/admin gate.
  const { data: caller } = await svc.from('profiles').select('role').eq('id', auth.userId).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
    return NextResponse.json({ error: 'Only owners or admins can change the plan.' }, { status: 403 })
  }

  const { error } = await svc.from('companies')
    .update({ subscription_plan: target.key, subscription_status: 'active' })
    .eq('id', auth.companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, plan: target.key })
}
