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
  site_id: z.string().uuid().nullish(),
  quote_id: z.string().uuid().nullish(),
  assigned_to: z.string().uuid().nullable().optional(),
  status: z.string().min(1).max(50).default('unscheduled'),
})

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId, companyId } = auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { title, description, customer_id, site_id, quote_id, assigned_to, status } = parsed.data
  const service = createServiceClient()

  // A site must belong to the same company (and the chosen customer, if any)
  if (site_id) {
    const { data: site } = await service
      .from('customer_sites').select('id, company_id, customer_id').eq('id', site_id).single()
    if (!site || site.company_id !== companyId || (customer_id && site.customer_id !== customer_id)) {
      return NextResponse.json({ error: 'Invalid site' }, { status: 400 })
    }
  }

  // Same for the quote — the service client bypasses RLS, so scope it explicitly
  if (quote_id) {
    const { data: quote } = await service
      .from('quotes').select('id, company_id').eq('id', quote_id).single()
    if (!quote || quote.company_id !== companyId) {
      return NextResponse.json({ error: 'Invalid quote' }, { status: 400 })
    }
  }

  const { data: company } = await service
    .from('companies')
    .select('default_job_assignee_id')
    .eq('id', companyId)
    .single()
  const fallbackAssignee = company?.default_job_assignee_id ?? userId
  const resolvedAssignee = assigned_to !== undefined ? assigned_to : fallbackAssignee

  if (resolvedAssignee) {
    const { data: assignee } = await service
      .from('profiles')
      .select('id, company_id, is_active')
      .eq('id', resolvedAssignee)
      .single()
    if (!assignee || assignee.company_id !== companyId || assignee.is_active === false) {
      return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
    }
  }

  const job_number = await nextDocNumber(service, companyId, 'job')

  const { data: job, error } = await service.from('jobs').insert({
    job_number,
    title,
    description: description ?? null,
    customer_id: customer_id ?? null,
    site_id: site_id ?? null,
    company_id: companyId,
    assigned_to: resolvedAssignee,
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
