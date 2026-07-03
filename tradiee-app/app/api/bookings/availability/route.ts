// GET /api/bookings/availability?companyId=<id>&packageId=<id>&profileId=<id?>
// Public, read-only. Powers the (Sprint D) public booking widget. Uses the
// service client since visitors aren't authenticated — this route only ever
// returns computed slot windows, never any row data directly.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAvailableSlots } from '@/lib/bookings/availability'

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const packageId = req.nextUrl.searchParams.get('packageId')
  const profileId = req.nextUrl.searchParams.get('profileId')
  if (!companyId || !packageId) {
    return NextResponse.json({ error: 'companyId and packageId required' }, { status: 400 })
  }

  const service = createServiceClient()
  const slots = await getAvailableSlots(service, companyId, packageId, profileId || null)
  return NextResponse.json({ slots })
}
