'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Package } from 'lucide-react'

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
}

export function PurchaseOrderBuilder({ companyId, profileId, poNumber, gstRate, suppliers, jobs, priceItems, defaultSupplierId, defaultJobId }: Props) {
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
    <div className="flex flex-col lg:flex-row gap-6 p-6">
      <div className="flex-1 space-y-4">
        <Card>
          <CardHeader className="font-semibold text-sm text-gray-900">Details</CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Supplier <span className="text-red-400">*</span></Label>
              <Select value={meta.supplierId} onChange={e => update('supplierId', e.target.value)} placeholder="Select supplier…" options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
            </div>
            <div>
              <Label>Link to job</Label>
              <Select value={meta.jobId} onChange={e => update('jobId', e.target.value)} placeholder="No job" options={jobs.map(j => ({ value: j.id, label: `${j.job_number} — ${j.title}` }))} />
            </div>
            <div>
              <Label>Expected delivery</Label>
              <Input type="date" value={meta.expected} onChange={e => update('expected', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Items</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
                <th className="text-left px-3 py-2 font-medium w-16">Unit</th>
                <th className="text-right px-3 py-2 font-medium w-28">Unit cost</th>
                <th className="text-right px-3 py-2 font-medium w-28">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="px-4 py-2"><Input value={l.description} onChange={e => updateLine(l.id, 'description', e.target.value)} className="h-7 text-sm" placeholder="Item…" /></td>
                  <td className="px-3 py-2"><Input type="number" step="any" value={l.quantity} onChange={e => updateLine(l.id, 'quantity', e.target.value)} className="h-7 text-sm text-right" /></td>
                  <td className="px-3 py-2"><Input value={l.unit} onChange={e => updateLine(l.id, 'unit', e.target.value)} className="h-7 text-sm" /></td>
                  <td className="px-3 py-2"><Input type="number" step="0.01" value={l.unit_cost} onChange={e => updateLine(l.id, 'unit_cost', e.target.value)} className="h-7 text-sm text-right" /></td>
                  <td className="px-3 py-2 text-right font-medium text-gray-700 whitespace-nowrap">{formatCurrency((parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0))}</td>
                  <td className="px-2 py-2"><button onClick={() => removeLine(l.id)} className="text-gray-300 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLines(ls => [...ls, newLine()])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
            {priceItems.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPickOpen(true)}><Package className="h-3.5 w-3.5" /> From price list</Button>}
          </div>
        </Card>

        <Card>
          <CardHeader className="font-semibold text-sm text-gray-900">Notes</CardHeader>
          <CardContent><Textarea value={meta.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="Delivery instructions, references…" /></CardContent>
        </Card>
      </div>

      <div className="w-full lg:w-72 shrink-0">
        <Card className="sticky top-20">
          <CardHeader className="font-semibold text-sm text-gray-900">{poNumber}</CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>GST ({Math.round(gstRate * 100)}%)</span><span>{formatCurrency(gst)}</span></div>
              <div className="flex justify-between font-semibold text-gray-900 text-base border-t border-gray-100 pt-2 mt-2"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>
            <Button className="w-full" loading={saving} onClick={save}>Create PO</Button>
          </CardContent>
        </Card>
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
