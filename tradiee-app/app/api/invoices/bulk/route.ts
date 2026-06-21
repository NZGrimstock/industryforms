import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { nextDocNumber } from '@/lib/numbering'
import { round2 } from '@/lib/pricing'

// Generate a draft invoice for each selected job in one action.
// Each invoice gets a single "Work completed" line at the job's quoted total
// (or 0 when there's no quote) — the user reviews/edits each draft afterwards.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobIds } = await req.json()
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one job' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id, companies(default_gst_rate)').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  const companyId = profile.company_id as string
  const gstRate = Number((profile.companies as unknown as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15)

  const { data: jobs } = await service
    .from('jobs')
    .select('id, title, customer_id, reference, quote_id, company_id')
    .eq('company_id', companyId)
    .in('id', jobIds)

  let created = 0
  for (const job of jobs ?? []) {
    let amount = 0
    if (job.quote_id) {
      const { data: q } = await service.from('quotes').select('subtotal').eq('id', job.quote_id).maybeSingle()
      amount = Number(q?.subtotal ?? 0)
    }
    const gst = round2(amount * gstRate)
    const total = round2(amount + gst)
    const invoiceNumber = await nextDocNumber(service, companyId, 'invoice')

    const { data: inv, error } = await service.from('invoices').insert({
      company_id: companyId, customer_id: job.customer_id, job_id: job.id,
      invoice_number: invoiceNumber, reference: job.reference, status: 'draft',
      subtotal: amount, gst_amount: gst, total, amount_paid: 0,
    }).select('id').single()
    if (error || !inv) continue

    await service.from('invoice_line_items').insert({
      invoice_id: inv.id, type: 'misc', description: `Work completed: ${job.title}`,
      quantity: 1, unit: 'job', unit_price: amount, tax_rate: gstRate, line_total: amount, sort_order: 0,
    })
    created++
  }

  return NextResponse.json({ created })
}
