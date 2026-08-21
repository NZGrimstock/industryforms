// Grants (or clears) a temporary comp plan on one company — for friends/
// testers giving feedback, not a customer billing mechanism. Called by the
// separate Industry Forms Admin console; see app/api/admin/companies/route.ts
// for the auth pattern and why this exists as a separate app-to-app API
// rather than the admin console writing to this database directly.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

// Comping to 'free'/'trial' is pointless — both are already reachable
// without a grant — so only real paid tiers are valid here.
const COMPABLE_PLANS = ['solo', 'team', 'pro'] as const

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_CONSOLE_API_KEY
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  return safeEqual(provided, expected)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const plan = body.plan === null ? null : String(body.plan ?? '')
  const until = body.until === null ? null : String(body.until ?? '')

  // Clearing: both null. Setting: both required, plan must be a real paid tier,
  // until must be a real, future, parseable date — a comp that's already
  // expired the moment it's set is either a typo or a no-op either way.
  if (plan !== null || until !== null) {
    if (!plan || !(COMPABLE_PLANS as readonly string[]).includes(plan)) {
      return NextResponse.json({ error: `plan must be one of ${COMPABLE_PLANS.join(', ')}, or both fields null to clear` }, { status: 400 })
    }
    const untilDate = until ? new Date(until) : null
    if (!untilDate || Number.isNaN(untilDate.getTime()) || untilDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'until must be a valid future date' }, { status: 400 })
    }
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('companies')
    .update({ comp_plan: plan, comp_until: until })
    .eq('id', id)
    .select('id, name, comp_plan, comp_until')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  await service.from('admin_audit_log').insert({
    admin_id: null,
    action: plan ? 'company.comp_set' : 'company.comp_cleared',
    target_type: 'company',
    target_id: id,
    details: { plan, until, source: 'industry-forms-admin-console' },
  })

  return NextResponse.json({ company: data })
}
