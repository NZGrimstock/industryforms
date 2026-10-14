'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Trash2, Package } from 'lucide-react'
import {
  DocumentWorkspace, Paper, PaperHeader, PaperFields, PaperColumns, PaperBlock, PaperLines, PaperLinesHead,
  PaperEditRow, PaperTotals, PaperSignatures, PaperLegend, InternalRail, RailCard,
  PAPER_INPUT, PAPER_LINE_GRID, PAPER_GHOST_BUTTON, type PaperCompany,
} from '@/components/documents/paper'

const PAPER_NUM = cn(PAPER_INPUT, 'text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')

type PriceItem = { id: string; name: string; unit: string; cost_price: number }
type Line = { id: string; description: string; quantity: string; unit: string; unit_cost: string; price_list_item_id: string | null }

let seq = 0
const newLine = (): Line => ({ id: `l${++seq}`, description: '', quantity: '1', unit: 'each', unit_cost: '0', price_list_item_id: null })

interface Props {
  companyId: string
  profileId: string
  poNumber: string
  gstRate: number
  suppliers: { id: string; name: string }[]
  jobs: { id: string; job_number: string; title: string }[]
  priceItems: PriceItem[]
  defaultSupplierId?: string
  defaultJobId?: string
  company: PaperCompany
}

export function PurchaseOrderBuilder({ companyId, profileId, poNumber, gstRate, suppliers, jobs, priceItems, defaultSupplierId, defaultJobId, company }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [meta, setMeta] = useState({ supplierId: defaultSupplierId ?? '', jobId: defaultJobId ?? '', expected: '', notes: '' })
  const [lines, setLines] = useState<Line[]>([newLine()])

  function update(k: string, v: string) { setMeta(m => ({ ...m, [k]: v })) }
  function updateLine(id: string, k: keyof Line, v: string) { setLines(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l)) }
  function removeLine(id: string) { setLines(ls => ls.filter(l => l.id !== id)) }
  function addFromPrice(item: PriceItem) {
    setLines(ls => [...ls, { ...newLine(), description: item.name, unit: item.unit, unit_cost: String(item.cost_price), price_list_item_id: item.id }])
    setPickOpen(false)
  }

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)
  const gst = subtotal * gstRate
  const total = subtotal + gst

  async function save() {
    if (!meta.supplierId) { toast('Select a supplier', 'error'); return }
    const valid = lines.filter(l => l.description.trim())
    if (valid.length === 0) { toast('Add at least one line item', 'error'); return }
    setSaving(true)
    const { data: po, error } = await supabase.from('purchase_orders').insert({
      company_id: companyId, supplier_id: meta.supplierId, job_id: meta.jobId || null,
      po_number: poNumber, status: 'draft', order_date: new Date().toISOString().slice(0, 10),
      expected_date: meta.expected || null, notes: meta.notes || null,
      subtotal, gst_amount: gst, total, created_by: profileId,
    }).select('id').single()
    if (error || !po) { toast(error?.message ?? 'Failed to save PO', 'error'); setSaving(false); return }

    await supabase.from('purchase_order_items').insert(valid.map((l, i) => ({
      purchase_order_id: po.id, company_id: companyId, price_list_item_id: l.price_list_item_id,
      description: l.description.trim(), quantity: parseFloat(l.quantity) || 1, unit: l.unit,
      unit_cost: parseFloat(l.unit_cost) || 0, line_total: (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), sort_order: i,
    })))

    toast('Purchase order created')
    router.push(`/purchase-orders/${po.id}`)
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">New purchase order <b className="font-semibold text-gray-900">{poNumber}</b></span>
          <span className="flex-1" />
          <Button size="sm" loading={saving} onClick={save}>Create PO</Button>
        </div>
        <PaperLegend who="supplier" />

        <DocumentWorkspace>
          <Paper label="Purchase order document">
            <PaperHeader company={company} docLabel="Purchase order" docNumber={poNumber} />
            <PaperFields
              fields={[
                { label: 'Order date', value: formatDate(new Date()) },
                { label: 'PO No.', value: poNumber },
                {
                  label: 'Expected delivery',
                  value: <input type="date" aria-label="Expected delivery" value={meta.expected} onChange={e => update('expected', e.target.value)} className={cn(PAPER_INPUT, 'py-0 font-bold')} />,
                },
              ]}
            />
            <PaperColumns>
              <PaperBlock title="Supplier">
                <select aria-label="Supplier" value={meta.supplierId} onChange={e => update('supplierId', e.target.value)} className={cn(PAPER_INPUT, 'cursor-pointer')}>
                  <option value="">Select supplier…</option>
                  {suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </PaperBlock>
              <PaperBlock title="Job">
                <select aria-label="Job" value={meta.jobId} onChange={e => update('jobId', e.target.value)} className={cn(PAPER_INPUT, 'cursor-pointer')}>
                  <option value="">No job</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.title}</option>)}
                </select>
              </PaperBlock>
            </PaperColumns>

            <PaperLines>
              <PaperLinesHead priceLabel="Unit cost" />
              {lines.map((l, i) => (
                <div key={l.id} className={cn(PAPER_LINE_GRID, 'group border-b border-gray-100 px-2 py-0.5')}>
                  <span className="relative text-xs text-gray-500">
                    <span className="group-focus-within:invisible group-hover:invisible">{i + 1}</span>
                    <button
                      type="button"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => removeLine(l.id)}
                      className="absolute -left-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 opacity-0 hover:text-red-600 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <input aria-label="Description" value={l.description} onChange={e => updateLine(l.id, 'description', e.target.value)} className={PAPER_INPUT} placeholder="Item…" />
                  <span className="flex gap-0.5">
                    <input type="number" step="any" aria-label="Quantity" value={l.quantity} onChange={e => updateLine(l.id, 'quantity', e.target.value)} className={cn(PAPER_NUM, 'w-[55%]')} />
                    <input aria-label="Unit" value={l.unit} onChange={e => updateLine(l.id, 'unit', e.target.value)} className={cn(PAPER_INPUT, 'w-[45%]')} />
                  </span>
                  <span className="flex items-center">
                    <span className="text-gray-500">$</span>
                    <input type="number" step="0.01" aria-label="Unit cost" value={l.unit_cost} onChange={e => updateLine(l.id, 'unit_cost', e.target.value)} className={PAPER_NUM} />
                  </span>
                  <span className="whitespace-nowrap pr-1 text-right">{formatCurrency((parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0))}</span>
                </div>
              ))}
              <PaperEditRow>
                <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => setLines(ls => [...ls, newLine()])}><Plus className="h-3.5 w-3.5" /> Line</button>
                {priceItems.length > 0 && <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => setPickOpen(true)}><Package className="h-3.5 w-3.5" /> Price list</button>}
              </PaperEditRow>
            </PaperLines>

            <PaperTotals
              rows={[{ label: 'Subtotal', value: formatCurrency(subtotal) }, { label: `GST ${Math.round(gstRate * 100)}%`, value: formatCurrency(gst) }]}
              grand={{ label: 'Total', value: formatCurrency(total) }}
            />

            <div className="mt-7">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[.05em] text-gray-600">Delivery instructions / notes</div>
              <textarea
                aria-label="Delivery instructions and notes" rows={3}
                value={meta.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Delivery instructions, references…"
                className={cn(PAPER_INPUT, 'block resize-y text-xs leading-[1.55] text-gray-700')}
              />
            </div>

            <PaperSignatures left="Authorised by" right="Received by" />
          </Paper>

          <InternalRail label="Internal — not on the purchase order">
            <RailCard>
              <p className="text-[13px] leading-normal text-gray-600">
                Fill the page in like the paper PO. Items from your price list come in at their cost price. Once created, a draft PO can still be changed on its own page until it&apos;s sent.
              </p>
            </RailCard>
          </InternalRail>
        </DocumentWorkspace>
      </div>

      <Dialog open={pickOpen} onClose={() => setPickOpen(false)} title="Add from price list" className="max-w-xl">
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {priceItems.map(item => (
            <button key={item.id} onClick={() => addFromPrice(item)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-800">{item.name}</span>
              <span className="text-sm font-medium text-gray-700">{formatCurrency(item.cost_price)}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </div>
  )
}
