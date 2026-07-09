// POST /api/jobs { title, description?, customer_id?, quote_id? }
// Creates a job with a proper auto-generated job_number.
// Used by the mobile app because nextDocNumber() is server-only.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { nextDocNumber } from '@/lib/numbering'

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  customer_id: z.string().uuid().nullish(),
  quote_id: z.string().uuid().nullish(),
  status: z.string().min(1).max(50).default('unscheduled'),
})

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId, companyId } = auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { title, description, customer_id, quote_id, status } = parsed.data

  const service = createServiceClient()
  const job_number = await nextDocNumber(service, companyId, 'job')

  const { data: job, error } = await service.from('jobs').insert({
    job_number,
    title,
    description: description ?? null,
    customer_id: customer_id ?? null,
    company_id: companyId,
    assigned_to: userId,
    status,
    ...(quote_id ? { quote_id } : {}),
  }).select('id, job_number').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If created from a quote, mark it as converted
  if (quote_id) {
    await service.from('quotes').update({ converted_to_job_id: job!.id }).eq('id', quote_id)
  }

  return NextResponse.json(job)
}
