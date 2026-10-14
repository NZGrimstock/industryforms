import type { createClient } from '@/lib/supabase/client'
import { computeTaxedTotals, type DiscountType } from '@/lib/pricing'

type Supabase = ReturnType<typeof createClient>

// Recompute an invoice's stored totals from its current line items (per-line
// tax + document discount) and save them. Shared by the toolbar actions
// (invoices/[id]/client.tsx) and the paper line editor
// (components/invoices/invoice-paper-lines.tsx), so both write identical maths.
//
// Draft-only by design: the protect_sent_invoice_financials trigger rejects
// total changes on a sent invoice, and RLS silently drops line writes there.
export async function recomputeInvoiceTotals(
  supabase: Supabase,
  invoiceId: string,
  gstRate: number,
  discType: DiscountType,
  discVal: number,
) {
  const { data: lines } = await supabase.from('invoice_line_items').select('line_total, tax_rate').eq('invoice_id', invoiceId)
  const taxed = computeTaxedTotals(
    (lines ?? []).map(l => ({ net: Number(l.line_total), taxRate: l.tax_rate != null ? Number(l.tax_rate) : gstRate })),
    discType,
    discVal,
  )
  const { error } = await supabase.from('invoices').update({
    subtotal: taxed.subtotal,
    discount_amount: taxed.discount,
    gst_amount: taxed.gst,
    total: taxed.total,
  }).eq('id', invoiceId)
  return { ...taxed, error }
}
