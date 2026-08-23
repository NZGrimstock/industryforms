// POST /api/billing/free-plan-carryover — a company that dropped from trial
// (or a paid plan) to the free floor may have more active customers/stock
// items than the free-plan caps (10 / 50). Rather than silently continuing to
// let them use however many hundred they already have (the free tier's caps
// would then only ever stop a *new* row, not the pile already sitting over
// the limit), the owner/admin picks which ones to keep active; everything
// else gets archived the same way "Delete customer" already does
// (is_active = false, archived_at = now()) — never a hard delete, since
// quotes/invoices/jobs reference these rows.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { effectivePlanKey, type BillingCompany } from '@/lib/billing'
import { getPlan } from '@/lib/plans'

const bodySchema = z.object({
  keepCustomerIds: z.array(z.string().uuid()).optional(),
  keepStockItemIds: z.array(z.string().uuid()).optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role, companies!company_id(subscription_status, subscription_plan, trial_ends_at, billing_exempt, comp_plan, comp_until)')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const company = profile.companies as unknown as BillingCompany | null
  if (effectivePlanKey(company) !== 'free') {
    return NextResponse.json({ error: 'This is only needed on the free plan.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { keepCustomerIds, keepStockItemIds } = parsed.data
  const plan = getPlan('free')
  const companyId = profile.company_id

  if (keepCustomerIds) {
    if (keepCustomerIds.length > plan.maxCustomers) {
      return NextResponse.json({ error: `Pick at most ${plan.maxCustomers} customers to keep.` }, { status: 400 })
    }
    // Ownership check: every id must belong to this company, not just any UUID
    // the client happened to send.
    const { data: owned, error: ownedError } = await supabase
      .from('customers').select('id').eq('company_id', companyId).in('id', keepCustomerIds)
    if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 400 })
    if ((owned ?? []).length !== keepCustomerIds.length) {
      return NextResponse.json({ error: 'One or more customers were not found.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('customers')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('id', 'in', `(${keepCustomerIds.map(id => `"${id}"`).join(',') || '""'})`)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (keepStockItemIds) {
    if (keepStockItemIds.length > plan.maxStockItems) {
      return NextResponse.json({ error: `Pick at most ${plan.maxStockItems} stock items to keep.` }, { status: 400 })
    }
    const { data: owned, error: ownedError } = await supabase
      .from('price_list_items').select('id').eq('company_id', companyId).in('id', keepStockItemIds)
    if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 400 })
    if ((owned ?? []).length !== keepStockItemIds.length) {
      return NextResponse.json({ error: 'One or more stock items were not found.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('price_list_items')
      .update({ is_active: false })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('id', 'in', `(${keepStockItemIds.map(id => `"${id}"`).join(',') || '""'})`)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
