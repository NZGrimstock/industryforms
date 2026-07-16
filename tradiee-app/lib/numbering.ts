// Preview of the next document number for display in "new" forms.
//
// The AUTHORITATIVE number is now assigned by a BEFORE INSERT trigger from an
// atomic per-company counter (migration 20260716120000) — it can never be reused,
// even after a delete, and is race-safe. This helper just reads that counter so the
// UI can show the number the trigger will assign. Callers may still set the value
// on insert; the trigger overrides it, so the preview being off by one under
// concurrency is only cosmetic.

type Kind = 'quote' | 'invoice' | 'job' | 'po'
const COL: Record<Kind, string> = { quote: 'quote_prefix', invoice: 'invoice_prefix', job: 'job_prefix', po: 'po_prefix' }
const FALLBACK: Record<Kind, string> = { quote: 'Q-', invoice: 'INV-', job: 'J-', po: 'PO-' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextDocNumber(supabase: any, companyId: string, kind: Kind): Promise<string> {
  const [{ data: counter }, { data: co }] = await Promise.all([
    supabase.from('doc_counters').select('last_value').eq('company_id', companyId).eq('kind', kind).maybeSingle(),
    supabase.from('companies').select(COL[kind]).eq('id', companyId).single(),
  ])
  const prefix = (co?.[COL[kind]] as string | undefined) ?? FALLBACK[kind]
  const next = Number(counter?.last_value ?? 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}
