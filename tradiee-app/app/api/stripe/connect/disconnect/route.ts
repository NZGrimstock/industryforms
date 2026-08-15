// POST /api/stripe/connect/disconnect — unlink this company's Stripe account.
//
// Owner/admin only: this stops every card payment the company can take
// (online invoices, deposits, Tap to Pay), so it's not a staff-level action.
//
// The Stripe account itself is left untouched — see disconnectAccount() in
// lib/connect.ts for why. Reconnecting is just the normal onboarding flow
// again, which creates a fresh Express account.
import { NextRequest, NextResponse } from 'next/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { disconnectAccount } from '@/lib/connect'

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only an owner or admin can disconnect the payouts account.' }, { status: 403 })
  }

  try {
    await disconnectAccount(auth.companyId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Stripe disconnect error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not disconnect the Stripe account.' },
      { status: 502 }
    )
  }
}
