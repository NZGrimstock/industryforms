// Lists every company for the separate Industry Forms Admin console (a
// different Next.js app, different Supabase project — ixqanvwohppohttbnrzz)
// to sync into its own `subscribers` table. Server-to-server only —
// authenticated by a shared secret (ADMIN_CONSOLE_API_KEY), not a user
// session, matching the timing-safe Bearer pattern in
// app/api/admin/setup/route.ts. This app stays the source of truth for
// company/subscription data; the admin console only ever reads through here.
//
// No pagination: company count is low for this early-stage SaaS. Add it
// when the table actually grows large enough to matter.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('companies')
    .select('id, name, email, phone, country, subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ companies: data ?? [] })
}
