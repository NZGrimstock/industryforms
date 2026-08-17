// POST /api/invoices { job_id, type?, progress_pct?, deposit_amount?, force? }
// Creates an invoice from a job. Used by the mobile app (nextDocNumber is server-only).
//
// type:
//  - 'materials' (default): line items from logged job materials — the original
//    "Complete and Invoice" flow. Empty draft when the job has no materials.
//  - 'full': quote-based. Copies quote lines, or bills the remaining balance when
//    something was already invoiced (mirrors web jobs/[id]/client.tsx createInvoice).
//  - 'deposit': fixed amount (deposit_amount) or % of quoted total (progress_pct).
//  - 'progress': % of quoted total (progress_pct).
//
// Over-invoicing above the quoted total returns 409 { error, confirm: true } unless
// force=true, so the app can show a confirm dialog and retry — same guard the web
// UI implements with confirm().
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { nextDocNumber } from '@/lib/numbering'
import { invoiceGuard } from '@/lib/job-financials'
import { lineNet } from '@/lib/pricing'

const bodySchema = z.object({
  job_id: z.string().uuid(),
  type: z.enum(['materials', 'full', 'deposit', 'progress']).default('materials'),
  progress_pct: z.number().gt(0).max(100).optional(),
  deposit_amount: z.number().gt(0).optional(),
  force: z.boolean().default(false),
})

type Line = { description: string; quantity: number; unit: string; unit_price: number; line_total: number; type: string }

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { companyId } = auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { job_id, type, progress_pct, deposit_amount, force } = parsed.data

  if (type === 'progress' && !progress_pct) {
    return NextResponse.json({ error: 'progress_pct required for a progress invoice' }, { status: 400 })
  }
  if (type === 'deposit' && !progress_pct && !deposit_amount) {
    return NextResponse.json({ error: 'deposit_amount or progress_pct required for a deposit invoice' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: job } = await service
    .from('jobs')
    .select('id, customer_id, company_id, title, quote_id, reference')
    .eq('id', job_id)
    .single()
  if (!job || job.company_id !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: co } = await service
    .from('companies')
    .select('default_gst_rate, prices_include_tax')
    .eq('id', companyId)
    .single()
  const gstRate = Number(co?.default_gst_rate ?? 0.15)
  const pricesIncludeTax = !!co?.prices_include_tax

  // Quoted total (excl. GST) and what's already been invoiced against this job
  let quoteLines: Line[] = []
  if (job.quote_id) {
    const { data } = await service
      .from('quote_line_items')
      .select('description, quantity, unit, unit_price, line_total, type')
      .eq('quote_id', job.quote_id)
      .order('sort_order')
    quoteLines = (data ?? []) as Line[]
  }
  let jobTotal = quoteLines.reduce((s, l) => s + Number(l.line_total), 0)

  // A quote-less job still has a real total once work is logged against it —
  // mirrors jobs/[id]/page.tsx's fallback (same reasoning: "Job total" must
  // come from the job, not require a quote). Without this, invoiceGuard()
  // below never fires for a quote-less job (jobTotal stayed 0), so "already
  // fully invoiced" was never enforced when invoicing from mobile.
  if (!job.quote_id) {
    const [{ data: materials }, { data: timesheets }] = await Promise.all([
      service.from('job_materials').select('quantity, unit_price').eq('job_id', job_id),
      service.from('timesheets').select('started_at, ended_at, break_minutes, bill_rate, is_billable').eq('job_id', job_id),
    ])
    // Net of GST when prices_include_tax is on — job_materials/timesheets have
    // no separate net line_total column like quote_line_items does, so
    // lineNet() strips the tax portion the same way quotes already do.
    const materialsTotal = (materials ?? []).reduce((s, m) => Number(m.unit_price) > 0 ? s + lineNet(Number(m.quantity), Number(m.unit_price), null, 0, gstRate, pricesIncludeTax) : s, 0)
    const labourTotal = (timesheets ?? []).reduce((s, t) => {
      if (!t.is_billable || !t.bill_rate || !t.ended_at) return s
      const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000 - Number(t.break_minutes ?? 0) / 60
      return hrs > 0 ? s + lineNet(hrs, Number(t.bill_rate), null, 0, gstRate, pricesIncludeTax) : s
    }, 0)
    jobTotal = materialsTotal + labourTotal
  }

  const { data: priorInvoices } = await service
    .from('invoices')
    .select('id, invoice_number, subtotal, status, created_at')
    .eq('job_id', job_id)
    .order('created_at', { ascending: false })
  const liveInvoices = (priorInvoices ?? []).filter(i => i.status !== 'void')
  const alreadyInvoiced = liveInvoices.reduce((s, i) => s + Number(i.subtotal ?? 0), 0)

  const EPS = 0.01
  let lines: Line[] = []
  let subtotal = 0
  let isProgress = false
  let pct: number | null = null

  if (type === 'deposit' || type === 'progress') {
    if (type === 'deposit' && deposit_amount) {
      subtotal = deposit_amount
    } else {
      if (jobTotal <= EPS) {
        return NextResponse.json({ error: 'This job has no quoted total to take a percentage of. Use a fixed deposit amount instead.' }, { status: 400 })
      }
      pct = progress_pct! / 100
      subtotal = jobTotal * pct
    }
    isProgress = true
    lines = [{
      description: type === 'deposit'
        ? `Deposit — ${job.title}`
        : `Progress claim — ${progress_pct}% of quoted works`,
      quantity: 1, unit: 'each', unit_price: subtotal, line_total: subtotal, type: 'misc',
    }]
  } else if (type === 'full') {
    const remaining = jobTotal - alreadyInvoiced
    if (alreadyInvoiced > EPS && remaining > EPS) {
      subtotal = remaining
      lines = [{
        description: `Balance of works — ${job.title}`,
        quantity: 1, unit: 'each', unit_price: remaining, line_total: remaining, type: 'misc',
      }]
    } else if (alreadyInvoiced > EPS) {
      // Fully invoiced — a further invoice is for variations; start empty.
      subtotal = 0
      lines = []
    } else if (quoteLines.length > 0) {
      lines = quoteLines
      subtotal = jobTotal
    } else {
      return NextResponse.json({ error: 'This job has no quote — invoice from materials instead.' }, { status: 400 })
    }
  } else {
    // 'materials' — original Complete-and-Invoice behavior
    const { data: materials } = await service
      .from('job_materials')
      .select('description, quantity, unit, unit_price')
      .eq('job_id', job_id)
      .order('created_at')
    lines = (materials ?? []).map(m => ({
      description: m.description,
      quantity: Number(m.quantity),
      unit: m.unit ?? 'ea',
      unit_price: Number(m.unit_price),
      line_total: lineNet(Number(m.quantity), Number(m.unit_price), null, 0, gstRate, pricesIncludeTax),
      type: 'labour',
    }))
    subtotal = lines.reduce((s, l) => s + l.line_total, 0)
  }

  // Both guards (and critically their ordering) live in lib/job-financials.ts
  // so the web client can't drift from this route. The app confirms with the
  // user and retries with force=true.
  const guard = invoiceGuard({ jobTotal, alreadyInvoiced, subtotal, force })
  if (guard === 'fully-invoiced') {
    const existing = liveInvoices[0] ?? null
    return NextResponse.json({
      error: `An invoice has already been generated for the full amount of this job${existing ? ` (${existing.invoice_number})` : ''}.`,
      confirm: true,
      alreadyFullyInvoiced: true,
      existingInvoice: existing ? { id: existing.id, invoice_number: existing.invoice_number } : null,
    }, { status: 409 })
  }
  if (guard === 'over-quote') {
    const over = alreadyInvoiced + subtotal - jobTotal
    return NextResponse.json({
      error: `This would bring total invoiced to $${(alreadyInvoiced + subtotal).toFixed(2)} — $${over.toFixed(2)} above the quoted $${jobTotal.toFixed(2)}.`,
      confirm: true,
    }, { status: 409 })
  }

  const gst = subtotal * gstRate
  const total = subtotal + gst
  const invoice_number = await nextDocNumber(service, companyId, 'invoice')

  const { data: inv, error } = await service.from('invoices').insert({
    company_id: companyId,
    customer_id: job.customer_id,
    job_id,
    invoice_number,
    reference: job.reference ?? null,
    status: 'draft',
    is_progress_invoice: isProgress,
    progress_pct: pct,
    invoice_date: new Date().toISOString().slice(0, 10),
    subtotal,
    gst_amount: gst,
    total,
    amount_paid: 0,
  }).select('id, invoice_number').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (lines.length > 0) {
    await service.from('invoice_line_items').insert(
      lines.map((l, idx) => ({
        invoice_id: inv!.id,
        type: l.type,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        line_total: l.line_total,
        sort_order: idx,
      }))
    )
  }

  return NextResponse.json(inv)
}
