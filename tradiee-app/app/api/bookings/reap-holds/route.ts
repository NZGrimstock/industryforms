/**
 * /api/bookings/reap-holds
 * Cron: transitions expired slot_held bookings to cancelled, releasing them
 * back to availability. Not load-bearing for correctness — tryHoldSlot()
 * already reaps inline for the exact slot being retried — this is broader
 * hygiene for holds that are abandoned outright (visitor closes the tab).
 *
 * Auth: GET with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron), or
 * POST with `x-cron-secret` header (external scheduler) — same pattern as
 * /api/reminders and /api/daily-todos.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

async function run() {
  const service = createServiceClient()
  const { data, error } = await service.from('bookings')
    .update({ status: 'cancelled' })
    .eq('status', 'slot_held')
    .lt('hold_expires_at', new Date().toISOString())
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reaped: data?.length ?? 0 })
}

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return run()
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return run()
  }
  return NextResponse.json({ info: 'Authed GET (Vercel Cron) or POST with x-cron-secret reaps expired booking holds' })
}
