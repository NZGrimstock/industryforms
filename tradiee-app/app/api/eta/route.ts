// POST /api/eta { fromLat, fromLng, toLat, toLng }
//
// Proxies LocationIQ Directions server-side so the mobile app never holds a
// LocationIQ key (Mobile Overhaul brief §16 open decision — server route
// over on-device). Used by the "On my way" screen to show a live ETA.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  fromLat: z.number().min(-90).max(90),
  fromLng: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  toLng: z.number().min(-180).max(180),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { fromLat, fromLng, toLat, toLng } = parsed.data

  const key = process.env.NEXT_PUBLIC_LOCATIONIQ_KEY
  if (!key) return NextResponse.json({ error: 'LocationIQ not configured' }, { status: 503 })

  const url = `https://us1.locationiq.com/v1/directions/driving/${fromLng},${fromLat};${toLng},${toLat}?key=${key}&overview=false`
  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ error: 'Could not calculate route' }, { status: 502 })

  const data = await res.json().catch(() => null) as { routes?: { duration: number; distance: number }[] } | null
  const route = data?.routes?.[0]
  if (!route) return NextResponse.json({ error: 'No route found' }, { status: 502 })

  return NextResponse.json({
    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
  })
}
