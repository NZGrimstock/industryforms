// GET /api/stripe/connect/status → live Connect onboarding state for the company.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { syncAccountStatus } from '@/lib/connect'

export async function GET(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await createServiceClient()
    .from('companies')
    .select('stripe_account_id')
    .eq('id', auth.companyId)
    .single()

  if (!company?.stripe_account_id) {
    return NextResponse.json({ connected: false, charges_enabled: false, payouts_enabled: false, details_submitted: false })
  }

  // Pull fresh flags from Stripe (also persists them). Falls back to false on a
  // transient Stripe error rather than 500-ing the Settings page.
  const status = await syncAccountStatus(company.stripe_account_id).catch(() => ({
    charges_enabled: false, payouts_enabled: false, details_submitted: false,
  }))
  return NextResponse.json({ connected: true, ...status })
}
