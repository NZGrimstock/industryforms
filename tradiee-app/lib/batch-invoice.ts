import type { SupabaseClient } from '@supabase/supabase-js'
import { lineNet } from './pricing'

export type BatchInvoiceJob = {
  id: string
  title: string
  customer_id: string
  quote_id: string | null
  reference?: string | null
}

export type BatchInvoiceResult = {
  created: { jobId: string; invoiceId: string }[]
  skipped: { jobId: string; title: string; reason: string }[]
}

// Batch counterpart to the per-job "Invoice from quote" / "Invoice from
// actuals" flow in app/(dashboard)/jobs/[id]/client.tsx — deliberately a
// simpler subset of it. That flow also handles variations, "already partly
// invoiced", and progress claims, all of which are genuinely per-job
// decisions a tradie makes one job at a time; a batch action with no per-job
// dialog can't ask those questions, so it only handles the common case
// (job not yet invoiced) and skips anything ambiguous rather than guessing.
export async function createBatchInvoices(
  supabase: SupabaseClient,
  jobs: BatchInvoiceJob[],
  opts: { companyId: string; gstRate: number; pricesIncludeTax: boolean; doneStatusKey: string | null }
): Promise<BatchInvoiceResult> {
  const result: BatchInvoiceResult = { created: [], skipped: [] }
  if (jobs.length === 0) return result

  // Jobs already invoiced (any non-void invoice) are skipped — batch-creating
  // a second invoice for a job that already has one is exactly the kind of
  // "which invoice/how much" judgment call that needs the job detail page.
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('job_id')
    .in('job_id', jobs.map(j => j.id))
    .neq('status', 'void')
  const alreadyInvoicedJobIds = new Set((existingInvoices ?? []).map(i => i.job_id))

  for (const job of jobs) {
    if (alreadyInvoicedJobIds.has(job.id)) {
      result.skipped.push({ jobId: job.id, title: job.title, reason: 'already invoiced' })
      continue
    }

    let lines: { description: string; quantity: number; unit: string; unit_price: number; line_total: number; type: string }[] = []

    if (job.quote_id) {
      const { data } = await supabase
        .from('quote_line_items')
        .select('description, quantity, unit, unit_price, line_total, type')
        .eq('quote_id', job.quote_id)
        .order('sort_order')
      lines = (data ?? []) as typeof lines
    } else {
      const [materialsRes, timesheetsRes] = await Promise.all([
        supabase.from('job_materials').select('description, quantity, unit, unit_price').eq('job_id', job.id),
        supabase.from('timesheets').select('started_at, ended_at, break_minutes, bill_rate, is_billable').eq('job_id', job.id),
      ])
      // Net of GST when prices_include_tax is on — see the identical fix and
      // comment in app/api/invoices/route.ts's 'materials' branch.
      const materialLines = (materialsRes.data ?? [])
        .filter(m => Number(m.unit_price) > 0)
        .map(m => ({ description: m.description as string, quantity: Number(m.quantity), unit: (m.unit as string) ?? 'each', unit_price: Number(m.unit_price), line_total: lineNet(Number(m.quantity), Number(m.unit_price), null, 0, opts.gstRate, opts.pricesIncludeTax), type: 'material' }))
      const labourByRate = new Map<number, number>()
      for (const t of timesheetsRes.data ?? []) {
        if (!t.is_billable || !t.bill_rate || !t.ended_at) continue
        const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000 - Number(t.break_minutes ?? 0) / 60
        if (hrs <= 0) continue
        labourByRate.set(Number(t.bill_rate), (labourByRate.get(Number(t.bill_rate)) ?? 0) + hrs)
      }
      const labourLines = [...labourByRate.entries()].map(([rate, hrs]) => {
        const qty = Math.round(hrs * 100) / 100
        return { description: 'Labour', quantity: qty, unit: 'hr', unit_price: rate, line_total: lineNet(qty, rate, null, 0, opts.gstRate, opts.pricesIncludeTax), type: 'labour' }
      })
      lines = [...materialLines, ...labourLines]
    }

    if (lines.length === 0) {
      result.skipped.push({ jobId: job.id, title: job.title, reason: job.quote_id ? 'quote has no line items' : 'no logged materials or billable time' })
      continue
    }

    const subtotal = lines.reduce((s, l) => s + l.line_total, 0)
    const gst = subtotal * opts.gstRate

    const { data: inv, error } = await supabase.from('invoices').insert({
      company_id: opts.companyId, customer_id: job.customer_id, job_id: job.id,
      invoice_number: 'PENDING', // overridden by the assign_doc_number trigger — see 20260716120000_unique_doc_numbers.sql
      reference: job.reference ?? null,
      status: 'draft', invoice_date: new Date().toISOString().slice(0, 10),
      subtotal, gst_amount: gst, total: subtotal + gst, amount_paid: 0,
    }).select('id').single()

    if (error || !inv) {
      result.skipped.push({ jobId: job.id, title: job.title, reason: error?.message ?? 'invoice insert failed' })
      continue
    }

    await supabase.from('invoice_line_items').insert(lines.map((l, idx) => ({
      invoice_id: inv.id, type: l.type, description: l.description,
      quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, line_total: l.line_total, sort_order: idx,
    })))

    if (opts.doneStatusKey) {
      await supabase.from('jobs').update({ status: opts.doneStatusKey }).eq('id', job.id)
    }

    result.created.push({ jobId: job.id, invoiceId: inv.id })
  }

  return result
}
