// Shared math for the job/customer financial summary boxes. Kept as pure
// functions so both pages compute "to invoice" the same way.

export type InvoiceForFinancials = { status: string; total: number | string; amount_paid: number | string }

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
