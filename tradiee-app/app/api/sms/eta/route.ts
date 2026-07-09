// POST /api/sms/eta { jobId, etaMinutes?, distanceKm?, status }
//
// Sibling of /api/sms/quote and /api/sms/invoice — sends a branded "on my
// way" / "running late" / "arrived" message. Channel-aware via notifyPreferred:
// SMS when Twilio is live, email fallback while dark (Mobile Overhaul brief
// §8 — never hard-fails while SMS is dark).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { notifyPreferred } from '@/lib/notify'
import { logCommunication } from '@/lib/comms'

const bodySchema = z.object({
  jobId: z.string().uuid(),
  etaMinutes: z.number().int().min(0).max(999).optional(),
  distanceKm: z.number().min(0).max(2000).optional(),
  status: z.enum(['on_way', 'running_late', 'arrived']).default('on_way'),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { jobId, etaMinutes, distanceKm, status } = parsed.data
  if (status !== 'arrived' && etaMinutes == null) {
    return NextResponse.json({ error: 'etaMinutes required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { data: job } = await service
    .from('jobs')
    .select('id, company_id, job_number, customer_id, customers(name, phone, email), companies(name, country)')
    .eq('id', jobId)
    .single()
  if (!job || job.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const customer = job.customers as unknown as { name: string; phone: string | null; email: string | null } | null
  const company = job.companies as unknown as { name: string; country: string | null } | null
  if (!customer || (!customer.phone && !customer.email)) {
    return NextResponse.json({ error: 'Customer has no phone or email' }, { status: 400 })
  }

  const tech = profile.full_name?.split(' ')[0] ?? 'Your technician'
  const firstName = customer.name.split(' ')[0]
  const companyName = company?.name ?? 'us'

  const body = status === 'arrived'
    ? `Hi ${firstName}, it's ${tech} from ${companyName} — I've arrived.`
    : status === 'running_late'
      ? `Hi ${firstName}, it's ${tech} from ${companyName} — running about ${etaMinutes} min late, sorry!`
      : `Hi ${firstName}, it's ${tech} from ${companyName}. On my way — ETA about ${etaMinutes} min${distanceKm ? ` (${distanceKm} km)` : ''}.`

  const results = await notifyPreferred({
    service,
    companyId: job.company_id,
    customerId: job.customer_id,
    eventType: 'job_eta',
    sms: customer.phone ? { to: customer.phone, country: (company?.country as 'NZ' | 'AU' | undefined) ?? 'NZ', body } : undefined,
    email: customer.email ? { to: customer.email, subject: `${companyName} — ${status === 'arrived' ? 'Arrived' : 'On the way'}`, html: `<p>${body}</p>` } : undefined,
  })

  const sentChannel = results.find(r => r.status === 'sent')?.channel ?? 'email'
  await logCommunication(service, {
    companyId: job.company_id, customerId: job.customer_id, channel: sentChannel,
    subject: `ETA sent — ${job.job_number}`, summary: body,
    relatedType: 'job', relatedId: jobId,
  })

  return NextResponse.json({ ok: true, body, results })
}
