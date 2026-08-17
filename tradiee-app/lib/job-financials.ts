// Shared math for the job/customer financial summary boxes. Kept as pure
// functions so both pages compute "to invoice" the same way.

import { lineNet, round2 } from './pricing.ts'

export type InvoiceForFinancials = { status: string; total: number | string; amount_paid: number | string }

export type ActualLine = { quantity: number; unit_price: number }

// GST-inclusive ceiling for a quote-less (time-and-materials) job, from its
// own logged materials + billable labour hours. Respects prices_include_tax
// the same way invoices do (lineNet(), lib/pricing.ts). Shared logic for the
// "jobSourcedCeiling" computation duplicated across jobs/[id]/page.tsx,
// customers/[id]/page.tsx, and the Jobs list's "To Invoice" tab.
export function actualsJobCeiling(lines: ActualLine[], gstRate: number, pricesIncludeTax: boolean): number {
  const net = lines.reduce((sum, l) => sum + lineNet(l.quantity, l.unit_price, null, 0, gstRate, pricesIncludeTax), 0)
  return net > 0 ? round2(net * (1 + gstRate)) : 0
}

// Void invoices never happened financially — excluded from every total below.
export function summarizeInvoices(invoices: InvoiceForFinancials[]) {
  const live = invoices.filter(i => i.status !== 'void')
  const invoiced = live.reduce((s, i) => s + Number(i.total), 0)
  const paid = live.reduce((s, i) => s + Number(i.amount_paid), 0)
  return { invoiced, paid, outstanding: invoiced - paid }
}

// "Job total" is the customer's agreed ceiling: the linked quote's total if
// the job came from one. Jobs created without a quote (pure time-and-materials)
// have no independent ceiling to compare against — total falls back to
// whatever's already been invoiced, so "to invoice" reads $0 rather than a
// guessed figure. That's a deliberate choice, not a missing feature: guessing
// a sell-side total from job_materials/timesheets would need to replicate the
// GST/discount math invoices already do, and a wrong number is worse than an
// honest $0 here.
export function jobTotal(quoteTotal: number | string | null | undefined, invoiced: number): number {
  return quoteTotal != null ? Number(quoteTotal) : invoiced
}

export function toInvoice(total: number, invoiced: number): number {
  return Math.max(0, total - invoiced)
}

/**
 * Which confirmation (if any) must be shown before creating another invoice
 * against a job. Pure so both the API route and the web client agree, and so
 * the ordering below is testable — see scripts/check-invoice-guard.mjs.
 *
 *  'fully-invoiced' — the job is already billed to its quoted total. Offer the
 *                     existing invoice; creating another is for variations.
 *  'over-quote'     — this invoice would push the total above the quote.
 *  null             — go ahead.
 *
 * Order matters. 'fully-invoiced' MUST be checked first: billing "the full
 * amount" on an already-complete job produces subtotal 0, which fails the
 * over-quote test's `subtotal > EPS`, so checking over-quote first let a
 * second empty draft invoice through with no prompt at all.
 */
export const INVOICE_EPS = 0.01

/**
 * Jobs list's "To Invoice" / "Invoiced in Full" split, for a job whose
 * status is terminal (completed-type, not cancelled). A job with zero
 * invoices ever created reads as "to invoice" even when nothing is owed
 * (ceiling 0, e.g. a job with no materials/labour logged) — nothing has
 * actually been billed yet, which is the state that needs a tradie's
 * attention, not "invoiced $0 automatically". Once at least one invoice
 * exists and the live (non-void) total covers the ceiling, it's full.
 */
export function jobInvoicingBucket(
  { ceiling, invoiced, invoiceCount }: { ceiling: number; invoiced: number; invoiceCount: number }
): 'to-invoice' | 'invoiced-in-full' {
  if (invoiceCount === 0) return 'to-invoice'
  return toInvoice(ceiling, invoiced) > INVOICE_EPS ? 'to-invoice' : 'invoiced-in-full'
}

export function invoiceGuard(
  { jobTotal, alreadyInvoiced, subtotal, force = false }:
  { jobTotal: number; alreadyInvoiced: number; subtotal: number; force?: boolean }
): 'fully-invoiced' | 'over-quote' | null {
  if (force) return null
  // A job with no quoted ceiling (time-and-materials) has nothing to compare
  // against, so neither guard can fire — same reasoning as jobTotal() above.
  if (jobTotal <= INVOICE_EPS) return null
  if (alreadyInvoiced + INVOICE_EPS >= jobTotal) return 'fully-invoiced'
  if (subtotal > INVOICE_EPS && alreadyInvoiced + subtotal > jobTotal + INVOICE_EPS) return 'over-quote'
  return null
}
