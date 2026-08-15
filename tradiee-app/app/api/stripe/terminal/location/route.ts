// GET /api/stripe/terminal/location — the per-company Stripe Terminal Location
// for Tap to Pay, replacing the old single global EXPO_PUBLIC_STRIPE_TERMINAL_
// LOCATION_ID env var now that charges are direct on each connected account.
// The mobile app fetches this before discoverReaders/connectReader.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { connectOptions } from '@/lib/stripe'
import { ensureTerminalLocation } from '@/lib/connect'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  let { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const bearer = req.headers.get('authorization')
    if (bearer?.startsWith('Bearer ')) {
      const { data } = await createServiceClient().auth.getUser(bearer.slice(7))
      user = data.user
    }
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await createServiceClient()
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: company } = await createServiceClient()
    .from('companies')
    .select('id, name, phone, address, country, stripe_account_id, stripe_charges_enabled, stripe_terminal_location_id')
    .eq('id', profile.company_id)
    .single()

  if (!connectOptions(company) || !company?.stripe_account_id) {
    return NextResponse.json(
      { error: 'Complete payouts setup in Settings → Integrations before taking card payments.' },
      { status: 409 }
    )
  }

  try {
    const locationId = await ensureTerminalLocation({
      id: company.id,
      name: company.name,
      phone: company.phone,
      address: company.address,
      country: company.country,
      stripe_account_id: company.stripe_account_id,
      stripe_terminal_location_id: company.stripe_terminal_location_id,
    })

    return NextResponse.json({ location_id: locationId })
  } catch (e) {
    // Without this, a Stripe error here (e.g. Terminal not enabled on this
    // connected account, or an address Stripe rejects) became an unhandled
    // 500 with no JSON body — the mobile client's res.json() then threw a
    // generic parse error, surfacing as "Could not resolve a Terminal
    // location" with the real reason lost. Now the actual message reaches
    // the user.
    console.error('ensureTerminalLocation error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not set up a Tap to Pay location for this company.' },
      { status: 502 }
    )
  }
}
