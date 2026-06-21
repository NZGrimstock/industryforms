// Next document number using the company's configurable prefix.
// Count-based sequence (prefix + zero-padded running count) — simple and
// matches the existing scheme; the prefix is now editable in Settings.

type Kind = 'quote' | 'invoice' | 'job' | 'po'
const TABLE: Record<Kind, string> = { quote: 'quotes', invoice: 'invoices', job: 'jobs', po: 'purchase_orders' }
const COL: Record<Kind, string> = { quote: 'quote_prefix', invoice: 'invoice_prefix', job: 'job_prefix', po: 'po_prefix' }
const FALLBACK: Record<Kind, string> = { quote: 'Q-', invoice: 'INV-', job: 'J-', po: 'PO-' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextDocNumber(supabase: any, companyId: string, kind: Kind): Promise<string> {
  const [{ count }, { data: co }] = await Promise.all([
    supabase.from(TABLE[kind]).select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('companies').select(COL[kind]).eq('id', companyId).single(),
  ])
  const prefix = (co?.[COL[kind]] as string | undefined) ?? FALLBACK[kind]
  return `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`
}
