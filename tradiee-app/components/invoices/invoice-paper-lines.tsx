'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Clock, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { cn, formatCurrency } from '@/lib/utils'
import { lineNet, computeTaxedTotals } from '@/lib/pricing'
import { recomputeInvoiceTotals } from '@/lib/invoice-totals'
import { useInvoiceLines, type InvoiceLine } from './invoice-lines'
import {
  PaperLines, PaperLinesHead, PaperLineRow, PaperEditRow, PaperTotals,
  PAPER_INPUT, PAPER_LINE_GRID, PAPER_GHOST_BUTTON,
} from '@/components/documents/paper'

const PAPER_NUM = cn(PAPER_INPUT, 'text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')
const LINE_COLS = 'id, description, quantity, unit, unit_price, discount_type, discount_value, line_total, sort_order, type, tax_rate'

// The invoice's line table + totals, drawn as the printed invoice.
//
// While the invoice is a draft every line is edited in place: a row saves when
// focus leaves it (line total via lineNet, then the invoice totals via
// recomputeInvoiceTotals — the same maths as the toolbar's Add actions). Once
// sent, it renders as plain print: RLS `admins update invoice line items` only
// matches draft invoices and drops other writes *silently* (0 rows, no error),
// so the UI must not offer edits it can't make.
export function InvoicePaperLines({ invoiceId, editable, gstRate, pricesIncludeTax }: {
  invoiceId: string
  editable: boolean
  gstRate: number
  pricesIncludeTax: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [supabase] = useState(() => createClient())
  const { lines, totals, addLines, removeLine, updateLine, markClean, applyTotals } = useInvoiceLines()
  const [busy, setBusy] = useState(false)
  // Last-saved signature per line, so leaving an unchanged row doesn't write.
  const saved = useRef(new Map<string, string>())
  const pendingFocus = useRef<string | null>(null)

  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order)
  const rateOf = (l: InvoiceLine) => (l.tax_rate != null ? Number(l.tax_rate) : gstRate)
  const netOf = (l: InvoiceLine) => lineNet(Number(l.quantity), Number(l.unit_price), l.discount_type, Number(l.discount_value ?? 0), rateOf(l), pricesIncludeTax)
  const sig = (l: InvoiceLine) => JSON.stringify([l.description, Number(l.quantity), l.unit, Number(l.unit_price)])

  useEffect(() => {
    for (const l of lines) if (!saved.current.has(l.id)) saved.current.set(l.id, sig(l))
    if (pendingFocus.current) {
      document.querySelector<HTMLInputElement>(`[data-inv-line="${pendingFocus.current}"] input`)?.focus()
      pendingFocus.current = null
    }
  })

  async function syncTotals() {
    const t = await recomputeInvoiceTotals(supabase, invoiceId, gstRate, totals.discount_type, Number(totals.discount_value ?? 0))
    if (t.error) toast(t.error.message, 'error')
    applyTotals({ subtotal: t.subtotal, discount_amount: t.discount, gst_amount: t.gst, total: t.total })
    router.refresh()
  }

  async function persist(l: InvoiceLine) {
    if (!editable) return
    const s = sig(l)
    if (saved.current.get(l.id) === s) return
    const line_total = netOf(l)
    const { data, error } = await supabase
      .from('invoice_line_items')
      .update({ description: l.description, quantity: Number(l.quantity) || 0, unit: l.unit, unit_price: Number(l.unit_price) || 0, line_total })
      .eq('id', l.id)
      .select('id')
    if (error) { toast(error.message, 'error'); return }
    if (!data || data.length === 0) {
      toast('This invoice is no longer a draft — that change was not saved', 'error')
      router.refresh()
      return
    }
    saved.current.set(l.id, s)
    markClean(l.id)
    updateLine(l.id, { line_total })
    await syncTotals()
  }

  async function remove(l: InvoiceLine) {
    setBusy(true)
    const { error } = await supabase.from('invoice_line_items').delete().eq('id', l.id)
    if (error) { toast(error.message, 'error'); setBusy(false); return }
    removeLine(l.id)
    markClean(l.id)
    saved.current.delete(l.id)
    await syncTotals()
    setBusy(false)
  }

  async function add(kind: 'line' | 'labour') {
    setBusy(true)
    const { data, error } = await supabase.from('invoice_line_items').insert({
      invoice_id: invoiceId,
      type: kind === 'labour' ? 'labour' : 'material',
      description: kind === 'labour' ? 'Labour' : '',
      quantity: 1,
      unit: kind === 'labour' ? 'hr' : 'each',
      unit_price: 0,
      tax_rate: gstRate,
      line_total: 0,
      sort_order: sorted.reduce((m, l) => Math.max(m, l.sort_order), 0) + 1,
    }).select(LINE_COLS).single()
    setBusy(false)
    if (error || !data) { toast(error?.message ?? 'Could not add a line', 'error'); return }
    pendingFocus.current = (data as InvoiceLine).id
    addLines([data as InvoiceLine])
  }

  // While editing, totals follow the typing (same computeTaxedTotals maths the
  // save uses); once sent, the stored figures are the record.
  const live = editable
    ? computeTaxedTotals(sorted.map(l => ({ net: netOf(l), taxRate: rateOf(l) })), totals.discount_type, Number(totals.discount_value ?? 0))
    : { subtotal: totals.subtotal, discount: totals.discount_amount, gst: totals.gst_amount, total: totals.total }
  const paid = Number(totals.amount_paid ?? 0)

  return (
    <>
      <PaperLines>
        <PaperLinesHead />
        {sorted.length === 0 && !editable && (
          <p className="px-2 py-8 text-center font-sans text-sm text-gray-500">No line items.</p>
        )}
        {sorted.map((l, i) =>
          editable ? (
            <div
              key={l.id}
              data-inv-line={l.id}
              className={cn(PAPER_LINE_GRID, 'group border-b border-gray-100 px-2 py-0.5')}
              onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) persist(l) }}
            >
              <span className="relative text-xs text-gray-500">
                <span className="group-focus-within:invisible group-hover:invisible">{i + 1}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => remove(l)}
                  className="absolute -left-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 opacity-0 hover:text-red-600 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
              <input
                aria-label="Description"
                placeholder="Description…"
                value={l.description}
                onChange={e => updateLine(l.id, { description: e.target.value })}
                className={PAPER_INPUT}
              />
              <span className="flex gap-0.5">
                <input
                  type="number" step="any" aria-label="Quantity"
                  value={l.quantity}
                  onChange={e => updateLine(l.id, { quantity: parseFloat(e.target.value) || 0 })}
                  className={cn(PAPER_NUM, 'w-[55%]')}
                />
                <input
                  aria-label="Unit"
                  value={l.unit}
                  onChange={e => updateLine(l.id, { unit: e.target.value })}
                  className={cn(PAPER_INPUT, 'w-[45%]')}
                />
              </span>
              <span className="flex items-center">
                <span className="text-gray-500">$</span>
                <input
                  type="number" step="0.01" aria-label="Unit price"
                  value={l.unit_price}
                  onChange={e => updateLine(l.id, { unit_price: parseFloat(e.target.value) || 0 })}
                  className={PAPER_NUM}
                />
              </span>
              <span className="whitespace-nowrap pr-1 text-right">{formatCurrency(netOf(l))}</span>
            </div>
          ) : (
            <PaperLineRow
              key={l.id}
              n={i + 1}
              description={l.description}
              qty={`${l.quantity} ${l.unit}`}
              price={formatCurrency(l.unit_price)}
              total={formatCurrency(l.line_total)}
            />
          ),
        )}
        {editable && (
          <PaperEditRow>
            <button type="button" disabled={busy} className={PAPER_GHOST_BUTTON} onClick={() => add('line')}><Plus className="h-3.5 w-3.5" /> Line</button>
            <button type="button" disabled={busy} className={PAPER_GHOST_BUTTON} onClick={() => add('labour')}><Clock className="h-3.5 w-3.5" /> Labour</button>
            <span className="text-[11.5px] text-gray-500">Price list, kits, sundries and job lines: <b className="font-semibold">Add</b> menu above</span>
          </PaperEditRow>
        )}
      </PaperLines>

      <PaperTotals
        rows={[
          { label: 'Total before discount', value: formatCurrency(live.subtotal) },
          ...(Number(live.discount) > 0
            ? [
                { label: `Total discount${totals.discount_type === 'percent' ? ` (${Number(totals.discount_value)}%)` : ''}`, value: `-${formatCurrency(live.discount)}` },
                { label: 'Total before tax', value: formatCurrency(Number(live.subtotal) - Number(live.discount)) },
              ]
            : []),
          { label: 'Total tax', value: formatCurrency(live.gst) },
        ]}
        grand={{ label: 'Total', value: formatCurrency(live.total) }}
        after={paid > 0
          ? [
              { label: 'Amount paid', value: `-${formatCurrency(paid)}` },
              { label: 'Balance due', value: formatCurrency(Number(live.total) - paid), strong: true },
            ]
          : undefined}
      />
    </>
  )
}
