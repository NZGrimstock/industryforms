// Shared math for the Statements page: which customers currently owe money,
// and how their balance breaks down by age. Separate from lib/job-financials.ts
// (per-job ceiling math) — this operates company-wide, grouped by customer,
// and needs a per-invoice aging bucket that job-financials has no use for.

export type StatementInvoice = {
  id: string
  customer_id: string
  invoice_number: string
  status: string
  total: number | string
  amount_paid: number | string
  due_date: string | null
  created_at: string
}

export type StatementLine = {
  id: string
  invoice_number: string
  date: string
  due_date: string | null
  total: number
  balance: number
  agingDays: number // <=0 = not yet due ("current")
}

export type CustomerStatement = {
  customerId: string
  lines: StatementLine[]
  outstanding: number
  current: number
  d30: number
  d60: number
  d90: number
}

// Groups a company's live invoices by customer, keeping only invoices that
// still have money owing — draft (never sent) and void (never happened) are
// excluded, same as summarizeInvoices in job-financials.ts. A fully paid
// invoice (balance <= 1c, floating-point noise) drops out too: a statement
// only lists what's actually owed.
export function buildCustomerStatements(
  invoices: StatementInvoice[],
  asOf: Date = new Date()
): Map<string, CustomerStatement> {
  const byCustomer = new Map<string, CustomerStatement>()

  for (const inv of invoices) {
    if (inv.status === 'void' || inv.status === 'draft') continue
    const total = Number(inv.total)
    const balance = total - Number(inv.amount_paid)
    if (balance <= 0.01) continue

    const agingDays = inv.due_date
      ? Math.floor((asOf.getTime() - new Date(inv.due_date).getTime()) / 86400000)
      : -1

    let entry = byCustomer.get(inv.customer_id)
    if (!entry) {
      entry = { customerId: inv.customer_id, lines: [], outstanding: 0, current: 0, d30: 0, d60: 0, d90: 0 }
      byCustomer.set(inv.customer_id, entry)
    }
    entry.lines.push({
      id: inv.id, invoice_number: inv.invoice_number, date: inv.created_at,
      due_date: inv.due_date, total, balance, agingDays,
    })
    entry.outstanding += balance
    if (agingDays <= 0) entry.current += balance
    else if (agingDays <= 30) entry.d30 += balance
    else if (agingDays <= 60) entry.d60 += balance
    else entry.d90 += balance
  }

  return byCustomer
}
