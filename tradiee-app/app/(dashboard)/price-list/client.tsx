'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PriceListItem, Kit } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Package, Plus, Pencil, Trash2, AlertTriangle, Upload, X, CheckCircle } from 'lucide-react'

interface Props {
  companyId: string
  items: PriceListItem[]
  kits: Kit[]
}

type CsvRow = { name: string; code: string; type: string; unit: string; cost_price: string; sell_price: string }

export function PriceListClient({ companyId, items, kits }: Props) {
  const [tab, setTab] = useState<'items' | 'kits'>('items')
  const [itemDialog, setItemDialog] = useState<PriceListItem | null | 'new'>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    const { error } = await supabase.from('price_list_items').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    else { toast('Item deleted'); router.refresh() }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      // Detect header row — skip if first line contains non-numeric sell price
      const startIdx = isNaN(Number((lines[0]?.split(',')[5] ?? '').replace(/"/g, '').trim())) ? 1 : 0
      const rows: CsvRow[] = []
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
        if (!cols[0]) continue
        rows.push({
          name: cols[0] ?? '',
          code: cols[1] ?? '',
          type: ['material', 'labour', 'service', 'equipment'].includes(cols[2]?.toLowerCase()) ? cols[2].toLowerCase() : 'material',
          unit: cols[3] ?? 'each',
          cost_price: cols[4] ?? '0',
          sell_price: cols[5] ?? '0',
        })
      }
      setCsvRows(rows)
    }
    reader.readAsText(file)
  }

  async function importCsv() {
    setCsvImporting(true)
    const payload = csvRows.map(r => ({
      company_id: companyId,
      name: r.name,
      code: r.code || null,
      type: r.type,
      unit: r.unit || 'each',
      cost_price: Number(r.cost_price) || 0,
      sell_price: Number(r.sell_price) || 0,
    }))
    const { error } = await supabase.from('price_list_items').insert(payload)
    setCsvImporting(false)
    if (error) toast(error.message, 'error')
    else {
      toast(`Imported ${payload.length} items`)
      setCsvOpen(false)
      setCsvRows([])
      router.refresh()
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['items', 'kits'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'items' ? `Items (${items.length})` : `Kits (${kits.length})`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === 'items' && (
            <button onClick={() => setCsvOpen(true)} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              <Upload className="h-3.5 w-3.5" /> CSV import
            </button>
          )}
          <Button onClick={() => setItemDialog('new')} size="sm">
            <Plus className="h-4 w-4" /> Add {tab === 'items' ? 'item' : 'kit'}
          </Button>
        </div>
      </div>

      {/* CSV Import dialog */}
      {csvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Import price list from CSV</h2>
                <p className="text-xs text-gray-400 mt-0.5">Columns: Name, Code, Type (material/labour/service), Unit, Cost price, Sell price</p>
              </div>
              <button onClick={() => { setCsvOpen(false); setCsvRows([]) }}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="p-6 flex-1 overflow-auto">
              {csvRows.length === 0 ? (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-12 cursor-pointer hover:border-[var(--accent,#f97316)]/40 transition-colors">
                  <Upload className="h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">Click to upload CSV file</p>
                  <p className="text-xs text-gray-400 mt-1">Supplier exports, spreadsheet exports</p>
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
                </label>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-gray-700 font-medium">{csvRows.length} rows ready to import</span>
                  </div>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Code</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Type</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Unit</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Cost</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Sell</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {csvRows.slice(0, 20).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-gray-700">{r.name}</td>
                            <td className="px-3 py-1.5 text-gray-400">{r.code}</td>
                            <td className="px-3 py-1.5 text-gray-500 capitalize">{r.type}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.unit}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">${r.cost_price}</td>
                            <td className="px-3 py-1.5 text-right font-medium text-gray-900">${r.sell_price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvRows.length > 20 && <p className="text-xs text-gray-400 text-center py-2">…and {csvRows.length - 20} more</p>}
                  </div>
                </div>
              )}
            </div>
            {csvRows.length > 0 && (
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
                <button onClick={() => setCsvRows([])} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Re-upload</button>
                <button onClick={importCsv} disabled={csvImporting} className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg disabled:opacity-50">
                  {csvImporting ? 'Importing…' : `Import ${csvRows.length} items`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {tab === 'items' && (
        items.length === 0 ? (
          <EmptyState icon={Package} title="No price list items" description="Add materials, labour rates, and services to build quotes faster" />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Type</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Unit</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Cost</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Sell price</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Stock</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(item => (
                  <tr key={item.id} onClick={() => setItemDialog(item)} className={`hover:bg-gray-50 cursor-pointer ${!item.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.code && <p className="text-xs text-gray-400">{item.code}</p>}
                    </td>
                    <td className="px-6 py-3 text-gray-500 capitalize">{item.type}</td>
                    <td className="px-6 py-3 text-gray-500">{item.unit}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{formatCurrency(item.cost_price)}</td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(item.sell_price)}</td>
                    <td className="px-6 py-3 text-right">
                      {item.quantity_on_hand !== null ? (
                        <span className={`flex items-center justify-end gap-1 ${item.low_stock_threshold && item.quantity_on_hand <= item.low_stock_threshold ? 'text-orange-500' : 'text-gray-600'}`}>
                          {item.low_stock_threshold && item.quantity_on_hand <= item.low_stock_threshold && <AlertTriangle className="h-3 w-3" />}
                          {item.quantity_on_hand} {item.unit}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-1">
                        <button onClick={e => { e.stopPropagation(); setItemDialog(item) }} className="p-1 text-gray-400 hover:text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); deleteItem(item.id) }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'kits' && (
        kits.length === 0 ? (
          <EmptyState icon={Package} title="No kits" description="Kits are reusable bundles of items — e.g. 'Install double powerpoint'" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kits.map(k => (
              <Card key={k.id} className="p-4">
                <h3 className="font-medium text-gray-900 mb-1">{k.name}</h3>
                {k.description && <p className="text-xs text-gray-400 mb-2">{k.description}</p>}
                <ul className="space-y-0.5">
                  {(k.kit_items ?? []).map((ki: {id: string; quantity: number; price_list_items?: PriceListItem}) => (
                    <li key={ki.id} className="flex items-center justify-between text-xs text-gray-600">
                      <span>{ki.price_list_items?.name ?? '—'}</span>
                      <span className="text-gray-400">×{ki.quantity}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )
      )}

      <Dialog open={!!itemDialog} onClose={() => setItemDialog(null)} title={itemDialog === 'new' ? 'Add item' : 'Edit item'}>
        {itemDialog && (
          <PriceItemForm
            companyId={companyId}
            item={itemDialog === 'new' ? undefined : itemDialog}
            onSuccess={() => { setItemDialog(null); router.refresh() }}
          />
        )}
      </Dialog>
    </div>
  )
}

function PriceItemForm({ companyId, item, onSuccess }: { companyId: string; item?: PriceListItem; onSuccess: () => void }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    type: item?.type ?? 'material',
    code: item?.code ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    unit: item?.unit ?? 'each',
    cost_price: item?.cost_price?.toString() ?? '0',
    sell_price: item?.sell_price?.toString() ?? '0',
    supplier_name: item?.supplier_name ?? '',
    quantity_on_hand: item?.quantity_on_hand?.toString() ?? '',
    low_stock_threshold: item?.low_stock_threshold?.toString() ?? '',
    is_active: item?.is_active ?? true,
  })

  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      company_id: companyId,
      type: form.type as PriceListItem['type'],
      code: form.code || null,
      name: form.name,
      description: form.description || null,
      unit: form.unit,
      cost_price: parseFloat(form.cost_price) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      supplier_name: form.supplier_name || null,
      quantity_on_hand: form.quantity_on_hand !== '' ? parseFloat(form.quantity_on_hand) : null,
      low_stock_threshold: form.low_stock_threshold !== '' ? parseFloat(form.low_stock_threshold) : null,
      is_active: form.is_active,
    }
    const { error } = item
      ? await supabase.from('price_list_items').update(payload).eq('id', item.id)
      : await supabase.from('price_list_items').insert(payload)
    if (error) toast(error.message, 'error')
    else { toast(item ? 'Item updated' : 'Item added'); onSuccess() }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Type</Label>
          <Select value={form.type} onChange={e => set('type', e.target.value)}
            options={[
              { value: 'material', label: 'Material' },
              { value: 'labour', label: 'Labour' },
              { value: 'misc', label: 'Misc' },
            ]} />
        </div>
        <div>
          <Label>Code</Label>
          <Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="SKU / internal code" />
        </div>
      </div>
      <div>
        <Label>Name <span className="text-red-400">*</span></Label>
        <Input value={form.name} onChange={e => set('name', e.target.value)} required />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
      </div>
      <div>
        <Label>Unit</Label>
        <Input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="each, hour, m, m2..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Cost price</Label>
          <Input type="number" step="0.01" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} />
        </div>
        <div>
          <Label>Sell price</Label>
          <Input type="number" step="0.01" value={form.sell_price} onChange={e => set('sell_price', e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Supplier</Label>
        <Input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Qty on hand</Label>
          <Input type="number" step="0.01" value={form.quantity_on_hand} onChange={e => set('quantity_on_hand', e.target.value)} placeholder="Leave blank to not track" />
        </div>
        <div>
          <Label>Low stock alert</Label>
          <Input type="number" step="0.01" value={form.low_stock_threshold} onChange={e => set('low_stock_threshold', e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <Label htmlFor="active" className="mb-0">Active</Label>
      </div>
      <Button type="submit" loading={loading}>{item ? 'Save changes' : 'Add item'}</Button>
    </form>
  )
}
