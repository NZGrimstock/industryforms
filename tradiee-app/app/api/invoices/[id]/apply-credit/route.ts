// POST /api/invoices/[id]/apply-credit { amount? }
//
// Applies a customer's available account credit (from prior credit notes,
// see POST /api/invoices/[id]/credit) to a DRAFT invoice as a negative line
// item. Draft-only, deliberately: invoice_line_items are already locked to
// draft-only at the RLS layer (20260804120000), and applying credit to an
// already-sent invoice would mean silently changing a document the customer
// has already seen. If a sent invoice needs credit applied, "Revert to
// draft" first — reusing that existing escape hatch rather than adding a
// second one.
//
// `amount` omitted means "apply as much as possible" (capped at both the
// customer's available balance and this invoice's own total — crediting more
// than an invoice is worth isn't meaningful here, it would just make the
// invoice negative).
//
// Credit notes are drawn oldest-first (FIFO, see allocateCreditApplication in
// lib/credit-notes.ts) and can span more than one — the user's own framing
// was "added to the next job/jobs", i.e. one credit note may need to cover
// several future invoices, or one invoice may need several credit notes.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { refreshXeroToken, allocateXeroCreditNote } from '@/lib/xero'
import { lineNet, computeTaxedTotals } from '@/lib/pricing'
import { availableCreditBalance, allocateCreditApplication, type CreditNoteRow } from '@/lib/credit-notes'

const bodySchema = z.object({ amount: z.number().positive().optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Only an owner or admin can apply account credit.' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const service = createServiceClient()
  const { data: invoice } = await service
    .from('invoices')
    .select('id, company_id, customer_id, status, total, discount_type, discount_value, external_id, external_system, invoice_date, companies(default_gst_rate, xero_tenant_id, xero_access_token, xero_refresh_token, xero_token_expires_at)')
    .eq('id', id)
    .single()
  if (!invoice || invoice.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Only a draft invoice can have credit applied. Revert it to draft first.' }, { status: 400 })
  }

  const { data: customerNotes } = await service
    .from('credit_notes')
    .select('id, amount, amount_applied, outcome, status, credit_note_number, external_id, external_system, created_at')
    .eq('customer_id', invoice.customer_id)
    .eq('outcome', 'account_credit')
    .neq('status', 'void')
    .order('created_at', { ascending: true }) // FIFO

  const available = availableCreditBalance((customerNotes ?? []) as CreditNoteRow[])
  if (available <= 0.01) {
    return NextResponse.json({ error: 'This customer has no available account credit.' }, { status: 400 })
  }

  const requested = Math.min(parsed.data.amount ?? available, available, Number(invoice.total))
  if (requested <= 0.01) {
    return NextResponse.json({ error: 'Nothing to apply — the invoice total is already 0.' }, { status: 400 })
  }

  const allocations = allocateCreditApplication(
    (customerNotes ?? []).map(n => ({ ...n, id: n.id })) as Array<CreditNoteRow & { id: string }>,
    requested
  )
  if (allocations.length === 0) {
    return NextResponse.json({ error: 'Nothing to apply.' }, { status: 400 })
  }
  const totalApplied = allocations.reduce((s, a) => s + a.amount, 0)
  const touchedNotes = (customerNotes ?? []).filter(n => allocations.some(a => a.id === n.id))
  const numbers = touchedNotes.map(n => n.credit_note_number).join(', ')

  // credit_note_applications rows + amount_applied/status bump — not
  // wrapped in a DB transaction (this project has no RPC for that here), so
  // a mid-loop failure leaves partial application state; each write is
  // independently idempotent-safe to retry (a second identical apply-credit
  // call recomputes `available` fresh and simply allocates less next time).
  for (const alloc of allocations) {
    const note = touchedNotes.find(n => n.id === alloc.id)!
    const newApplied = Number(note.amount_applied) + alloc.amount
    const { error: applyErr } = await service.from('credit_note_applications').insert({
      credit_note_id: alloc.id, invoice_id: id, amount: alloc.amount,
    })
    if (applyErr) return NextResponse.json({ error: applyErr.message }, { status: 500 })
    const { error: noteErr } = await service.from('credit_notes').update({
      amount_applied: newApplied,
      status: newApplied >= Number(note.amount) - 0.01 ? 'fully_applied' : 'active',
    }).eq('id', alloc.id)
    if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 })
  }

  const co = invoice.companies as unknown as { default_gst_rate: number | null; xero_tenant_id: string | null; xero_access_token: string | null; xero_refresh_token: string | null; xero_token_expires_at: string | null } | null
  const gstRate = co?.default_gst_rate ?? 0.15

  const { data: insertedLine, error: lineErr } = await service.from('invoice_line_items').insert({
    invoice_id: id,
    type: 'misc',
    description: `Account credit applied (${numbers})`,
    quantity: 1,
    unit: 'each',
    unit_price: -totalApplied,
    tax_rate: gstRate,
    line_total: lineNet(1, -totalApplied, null, 0, gstRate, true),
    sort_order: 100,
  }).select('id').single()
  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 })

  const { data: allLines } = await service.from('invoice_line_items').select('line_total, tax_rate').eq('invoice_id', id)
  const taxed = computeTaxedTotals(
    (allLines ?? []).map(l => ({ net: Number(l.line_total), taxRate: l.tax_rate != null ? Number(l.tax_rate) : gstRate })),
    invoice.discount_type, invoice.discount_value
  )
  await service.from('invoices').update({
    subtotal: taxed.subtotal, discount_amount: taxed.discount, gst_amount: taxed.gst, total: taxed.total,
  }).eq('id', id)

  // Best-effort Xero allocation — only meaningful if BOTH the credit note and
  // this invoice are already synced to Xero. Applying credit must never be
  // blocked on Xero sync state; a failure here is logged and swallowed, never
  // returned as an error (the application itself already succeeded above).
  if (invoice.external_system === 'xero' && invoice.external_id && co?.xero_tenant_id && co.xero_refresh_token) {
    try {
      let accessToken = co.xero_access_token!
      if (!co.xero_token_expires_at || new Date(co.xero_token_expires_at) < new Date()) {
        const refreshed = await refreshXeroToken(co.xero_refresh_token)
        accessToken = refreshed.access_token
        await service.from('companies').update({
          xero_access_token: refreshed.access_token,
          xero_refresh_token: refreshed.refresh_token,
          xero_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('id', auth.companyId)
      }
      for (const note of touchedNotes) {
        if (note.external_system !== 'xero' || !note.external_id) continue
        const alloc = allocations.find(a => a.id === note.id)!
        await allocateXeroCreditNote({
          accessToken, tenantId: co.xero_tenant_id,
          xeroCreditNoteId: note.external_id, xeroInvoiceId: invoice.external_id,
          amount: alloc.amount, date: invoice.invoice_date ?? new Date().toISOString(),
        })
        await service.from('credit_note_applications')
          .update({ external_synced_at: new Date().toISOString() })
          .eq('credit_note_id', note.id).eq('invoice_id', id)
      }
    } catch (e) {
      console.error('Xero credit-note allocation error (non-fatal):', e)
    }
  }

  return NextResponse.json({ ok: true, applied: totalApplied, lineItemId: insertedLine?.id })
}
