// POST /api/stripe/connect/onboard  → { url } for the Settings "Get paid" button
// GET  /api/stripe/connect/onboard?refresh=1 → Stripe's refresh_url; regenerates
//      an onboarding link and redirects (links are single-use / expiring).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { ensureConnectedAccount, createOnboardingLink } from '@/lib/connect'

async function startOnboarding(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return { error: 'Unauthorized' as const, status: 401 }
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return { error: 'Only an owner or admin can set up payouts' as const, status: 403 }
  }

  const { data: company } = await createServiceClient()
    .from('companies')
    .select('id, name, email, country, stripe_account_id')
    .eq('id', auth.companyId)
    .single()
  if (!company) return { error: 'Company not found' as const, status: 404 }

  // ensureConnectedAccount/createOnboardingLink call the Stripe API directly —
  // an unhandled throw here (bad params, network error, etc.) would otherwise
  // reach the client as an empty 500 body ("Unexpected end of JSON input").
  try {
    const accountId = await ensureConnectedAccount(company)
    const url = await createOnboardingLink(accountId)
    return { url }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not start Stripe onboarding', status: 500 as const }
  }
}

export async function POST(req: NextRequest) {
  const result = await startOnboarding(req)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ url: result.url })
}

export async function GET(req: NextRequest) {
  const result = await startOnboarding(req)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.redirect(result.url)
}
