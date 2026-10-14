'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { cn, formatCurrency } from '@/lib/utils'
import { round2 } from '@/lib/pricing'
import {
  PaperLines, PaperLinesHead, PaperLineRow, PaperEditRow, PaperTotals,
  PAPER_INPUT, PAPER_LINE_GRID, PAPER_GHOST_BUTTON,
} from '@/components/documents/paper'

const PAPER_NUM = cn(PAPER_INPUT, 'text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')

export type PoItem = { id: string; description: string; quantity: number | string; unit: string; unit_cost: number | string; line_total: number | string; sort_order: number }

// Lines, totals and delivery notes of a purchase order, drawn as the printed
// PO. While the PO is a draft they are edited in place: a row saves when focus
// leaves it, then the PO's subtotal / GST / total are recomputed with the same
// sum the builder uses (subtotal × gstRate). There is no DB-level draft lock on
// purchase_order_items, so `editable` is the only guard — pass status === 'draft'.
export function PoPaperEditor({ poId, companyId, gstRate, initialItems, initialNotes, editable, stored }: {
  /** The PO's saved totals — shown as the record once it is no longer a draft. */
  stored: { subtotal: number; gst: number; total: number }
  poId: string
  companyId: string
  gstRate: number
  initialItems: PoItem[]
  initialNotes: string | null
  editable: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState(() => [...initialItems].sort((a, b) => a.sort_order - b.sort_order))
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [busy, setBusy] = useState(false)
  const saved = useRef(new Map<string, string>())
  const pendingFocus = useRef<string | null>(null)

  const totalOf = (i: PoItem) => round2((Number(i.quantity) || 0) * (Number(i.unit_cost) || 0))
  const sig = (i: PoItem) => JSON.stringify([i.description, Number(i.quantity), i.unit, Number(i.unit_cost)])

  useEffect(() => {
    for (const i of items) if (!saved.current.has(i.id)) saved.current.set(i.id, sig(i))
    if (pendingFocus.current) {
      document.querySelector<HTMLInputElement>(`[data-po-line="${pendingFocus.current}"] input`)?.focus()
      pendingFocus.current = null
    }
  })

  const liveSub = round2(items.reduce((s, i) => s + totalOf(i), 0))
  const subtotal = editable ? liveSub : stored.subtotal
  const gst = editable ? round2(liveSub * gstRate) : stored.gst
  const total = editable ? round2(liveSub + gst) : stored.total

  function patch(id: string, p: Partial<PoItem>) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...p } : i)))
  }

  async function saveTotals(next: PoItem[]) {
    const sub = round2(next.reduce((s, i) => s + totalOf(i), 0))
    const g = round2(sub * gstRate)
    const { error } = await supabase.from('purchase_orders').update({ subtotal: sub, gst_amount: g, total: round2(sub + g) }).eq('id', poId)
    if (error) toast(error.message, 'error')
    router.refresh()
  }

  async function persist(i: PoItem) {
    if (!editable) return
    const s = sig(i)
    if (saved.current.get(i.id) === s) return
    const { error } = await supabase.from('purchase_order_items').update({
      description: i.description,
      quantity: Number(i.quantity) || 0,
      unit: i.unit,
      unit_cost: Number(i.unit_cost) || 0,
      line_total: totalOf(i),
    }).eq('id', i.id)
    if (error) { toast(error.message, 'error'); return }
    saved.current.set(i.id, s)
    await saveTotals(items)
  }

  async function add() {
    setBusy(true)
    const { data, error } = await supabase.from('purchase_order_items').insert({
      purchase_order_id: poId,
      company_id: companyId,
      description: '',
      quantity: 1,
      unit: 'each',
      unit_cost: 0,
      line_total: 0,
      sort_order: items.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1,
    }).select('id, description, quantity, unit, unit_cost, line_total, sort_order').single()
    setBusy(false)
    if (error || !data) { toast(error?.message ?? 'Could not add a line', 'error'); return }
    pendingFocus.current = data.id
    setItems(prev => [...prev, data as PoItem])
  }

  async function remove(i: PoItem) {
    setBusy(true)
    const { error } = await supabase.from('purchase_order_items').delete().eq('id', i.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    const next = items.filter(x => x.id !== i.id)
    setItems(next)
    saved.current.delete(i.id)
    await saveTotals(next)
  }

  async function saveNotes() {
    if ((initialNotes ?? '') === notes) return
    const { error } = await supabase.from('purchase_orders').update({ notes: notes || null }).eq('id', poId)
    if (error) toast(error.message, 'error')
    else router.refresh()
  }

  return (
    <>
      <PaperLines>
        <PaperLinesHead priceLabel="Unit cost" />
        {items.length === 0 && !editable && <p className="px-2 py-8 text-center font-sans text-sm text-gray-500">No items.</p>}
        {items.map((i, idx) =>
          editable ? (
            <div
              key={i.id}
              data-po-line={i.id}
              className={cn(PAPER_LINE_GRID, 'group border-b border-gray-100 px-2 py-0.5')}
              onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) persist(i) }}
            >
              <span className="relative text-xs text-gray-500">
                <span className="group-focus-within:invisible group-hover:invisible">{idx + 1}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove line ${idx + 1}`}
                  onClick={() => remove(i)}
                  className="absolute -left-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 opacity-0 hover:text-red-600 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
              <input aria-label="Description" placeholder="Item…" value={i.description} onChange={e => patch(i.id, { description: e.target.value })} className={PAPER_INPUT} />
              <span className="flex gap-0.5">
                <input type="number" step="any" aria-label="Quantity" value={i.quantity} onChange={e => patch(i.id, { quantity: e.target.value })} className={cn(PAPER_NUM, 'w-[55%]')} />
                <input aria-label="Unit" value={i.unit} onChange={e => patch(i.id, { unit: e.target.value })} className={cn(PAPER_INPUT, 'w-[45%]')} />
              </span>
              <span className="flex items-center">
                <span className="text-gray-500">$</span>
                <input type="number" step="0.01" aria-label="Unit cost" value={i.unit_cost} onChange={e => patch(i.id, { unit_cost: e.target.value })} className={PAPER_NUM} />
              </span>
              <span className="whitespace-nowrap pr-1 text-right">{formatCurrency(totalOf(i))}</span>
            </div>
          ) : (
            <PaperLineRow
              key={i.id}
              n={idx + 1}
              description={i.description}
              qty={`${i.quantity} ${i.unit}`}
              price={formatCurrency(Number(i.unit_cost))}
              total={formatCurrency(Number(i.line_total))}
            />
          ),
        )}
        {editable && (
          <PaperEditRow>
            <button type="button" disabled={busy} className={PAPER_GHOST_BUTTON} onClick={add}><Plus className="h-3.5 w-3.5" /> Line</button>
          </PaperEditRow>
        )}
      </PaperLines>

      <PaperTotals
        rows={[{ label: 'Subtotal', value: formatCurrency(subtotal) }, { label: `GST ${Math.round(gstRate * 100)}%`, value: formatCurrency(gst) }]}
        grand={{ label: 'Total', value: formatCurrency(total) }}
      />

      {(editable || notes) && (
        <div className="mt-7">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[.05em] text-gray-600">Delivery instructions / notes</div>
          {editable ? (
            <textarea
              aria-label="Delivery instructions and notes" rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Delivery instructions, references…"
              className={cn(PAPER_INPUT, 'block resize-y text-xs leading-[1.55] text-gray-700')}
            />
          ) : (
            <p className="whitespace-pre-wrap text-xs leading-[1.55] text-gray-700">{notes}</p>
          )}
        </div>
      )}
    </>
  )
}
