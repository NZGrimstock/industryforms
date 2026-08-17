import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getPlan, planForSeats } from '@/lib/plans'
import { effectivePlanKey } from '@/lib/billing'

const bodySchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  role: z.enum(['owner', 'admin', 'staff']).optional(),
  companyId: z.string().uuid(),
  hourly_bill_rate: z.number().nonnegative().nullish(),
  hourly_cost_rate: z.number().nonnegative().nullish(),
})

export async function POST(request: Request) {
  try {
    // This route creates a new auth user + returns its temp password in the
    // response, so it must never be reachable without proving the caller is
    // an owner/admin of the exact company they're inviting into. companyId
    // is not a secret — it's rendered into the public booking widget's
    // client JS — so without this check, anyone could invite an 'admin' into
    // any company that has a public booking page and get its password back.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { full_name, email, role, companyId, hourly_bill_rate, hourly_cost_rate } = parsed.data

    const { data: callerProfile } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single()
    if (!callerProfile || callerProfile.company_id !== companyId || (callerProfile.role !== 'owner' && callerProfile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = createServiceClient()

    // ── Server-side seat check: don't let the client bypass the plan cap ──
    const [{ count }, { data: company }] = await Promise.all([
      service.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
      service.from('companies').select('subscription_plan, subscription_status, trial_ends_at, billing_exempt').eq('id', companyId).single(),
    ])
    const exempt = company?.billing_exempt === true
    if (!exempt) {
      const plan = getPlan(effectivePlanKey(company))
      const desired = (count ?? 0) + 1
      const needed = planForSeats(plan, desired)
      if (needed) {
        return NextResponse.json({
          error: `Adding a member would exceed the ${plan.label} seat cap. Upgrade to ${needed.label} ($${needed.monthly}/mo) first.`,
          requiresUpgradeTo: needed.key,
          requiresUpgradeMonthly: needed.monthly,
          currentPlan: plan.key,
        }, { status: 402 })
      }
    }

    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    const { error: profileError } = await service.from('profiles').insert({
      id: authData.user.id,
      company_id: companyId,
      full_name,
      email,
      role: role ?? 'staff',
      hourly_bill_rate: hourly_bill_rate ?? null,
      hourly_cost_rate: hourly_cost_rate ?? null,
    })
    if (profileError) {
      await service.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // In production, send a password reset email here so the user sets their own password
    // await supabase.auth.admin.generateLink({ type: 'recovery', email })

    return NextResponse.json({ success: true, tempPassword }) // Return temp pw for dev convenience
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
