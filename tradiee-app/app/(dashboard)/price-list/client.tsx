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
  standardMarkupEnabled: boolean
  standardMarkupPct: number
  items: PriceListItem[]
  kits: Kit[]
  customerGroups: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
}

type CsvRow = { name: string; code: string; type: string; unit: string; cost_price: string; sell_price: string }

export function PriceListClient({ companyId, standardMarkupEnabled, standardMarkupPct, items, kits, customerGroups, suppliers }: Props) {
  const [tab, setTab] = useState<'items' | 'kits' | 'groups'>('items')
  const [itemDialog, setItemDialog] = useState<PriceListItem | null | 'new'>(null)
  const [kitDialog, setKitDialog] = useState<Kit | null | 'new'>(null)
  const [availableItems, setAvailableItems] = useState(items)
  const [groups, setGroups] = useState(customerGroups)
  const [newGroup, setNewGroup] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
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

  async function deleteSelectedItems() {
    if (selectedIds.length === 0) return
    if (!confirm(`Delete ${selectedIds.length} selected inventory item${selectedIds.length === 1 ? '' : 's'}?`)) return
    const { error } = await supabase.from('price_list_items').delete().in('id', selectedIds)
    if (error) toast(error.message, 'error')
    else {
      toast(`Deleted ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}`)
      setSelectedIds([])
      router.refresh()
    }
  }

  async function deleteKit(id: string) {
    if (!confirm('Delete this kit? Standard price list items in the kit will be kept.')) return
    const { error } = await supabase.from('kits').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    else { toast('Kit deleted'); router.refresh() }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function addGroup() {
    if (!newGroup.trim()) return
    const { data, error } = await supabase
      .from('customer_groups')
      .insert({ company_id: companyId, name: newGroup.trim() })
      .select('id, name')
      .single()
    if (error) toast(error.message, 'error')
    else {
      setGroups(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewGroup('')
      toast('Pricing group added')
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm('Delete this pricing group? Customers assigned to it will fall back to standard pricing.')) return
    const { error } = await supabase.from('customer_groups').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    else {
      setGroups(prev => prev.filter(group => group.id !== id))
      toast('Pricing group deleted')
      router.refresh()
    }
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
    const payload = csvRows.map(r => {
      const cost = Number(r.cost_price) || 0
      const sell = Number(r.sell_price) || 0
      return ({
      company_id: companyId,
      name: r.name,
      code: r.code || null,
      type: r.type,
      unit: r.unit || 'each',
      cost_price: cost,
      sell_price: sell || (standardMarkupEnabled ? Number((cost * (1 + standardMarkupPct / 100)).toFixed(2)) : 0),
    })
    })
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
          {(['items', 'kits', 'groups'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'items' ? `Items (${items.length})` : t === 'kits' ? `Kits (${kits.length})` : `Groups (${groups.length})`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === 'items' && selectedIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={deleteSelectedItems}>
              <Trash2 className="h-4 w-4" /> Delete selected ({selectedIds.length})
            </Button>
          )}
          {tab === 'items' && (
            <button onClick={() => setCsvOpen(true)} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              <Upload className="h-3.5 w-3.5" /> CSV import
            </button>
          )}
          {tab === 'items' && (
            <Button onClick={() => setItemDialog('new')} size="sm">
              <Plus className="h-4 w-4" /> Add {tab === 'items' ? 'item' : 'kit'}
            </Button>
          )}
          {tab === 'kits' && (
            <Button onClick={() => setKitDialog('new')} size="sm">
              <Plus className="h-4 w-4" /> Add kit
            </Button>
          )}
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
                {items.map(item => {
                  const selected = selectedIds.includes(item.id)
                  return (
                  <tr key={item.id} onClick={() => toggleSelected(item.id)} className={`hover:bg-gray-50 cursor-pointer ${selected ? 'bg-orange-50' : ''} ${!item.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{selected && <span className="mr-2 text-orange-500">✓</span>}{item.name}</p>
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
                )})}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'kits' && (
        kits.length === 0 ? (
          <EmptyState icon={Package} title="No kits" description="Kits are reusable bundles of items, e.g. Install double powerpoint" />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Kit</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">SKU / code</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Cost</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Sell price</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Items</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
            {kits.map(k => (
              <tr key={k.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <p className="font-medium text-gray-900">{k.name}</p>
                  {k.description && <p className="text-xs text-gray-400">{k.description}</p>}
                </td>
                <td className="px-6 py-3 text-gray-500">{k.code || <span className="text-gray-300">—</span>}</td>
                <td className="px-6 py-3 text-right text-gray-600">{formatCurrency((k.kit_items ?? []).reduce((sum: number, ki: { quantity: number; price_list_items?: PriceListItem }) => sum + Number(ki.quantity) * Number(ki.price_list_items?.cost_price ?? 0), 0))}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(Number(k.sell_price ?? 0))}</td>
                <td className="px-6 py-3 text-gray-500">{(k.kit_items ?? []).length} item{(k.kit_items ?? []).length === 1 ? '' : 's'}</td>
                <td className="px-6 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => setKitDialog(k)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => deleteKit(k.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'groups' && (
        <Card className="p-4">
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Create pricing groups here, assign a customer to a group on their customer record, then open any standard price-list item and set that group&apos;s override under Pricing levels. Quotes, jobs, and invoices use the customer&apos;s group price automatically.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end mb-4">
            <div className="flex-1">
              <Label>New pricing group</Label>
              <Input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Wholesale, VIP, Builders, Property managers" />
            </div>
            <Button type="button" onClick={addGroup}>Add group</Button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">No pricing groups yet. Add one, assign customers to it, then set item overrides.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {groups.map(group => (
                <div key={group.id} className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-gray-800">{group.name}</span>
                  <button onClick={() => deleteGroup(group.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Dialog open={!!itemDialog} onClose={() => setItemDialog(null)} title={itemDialog === 'new' ? 'Add item' : 'Edit item'}>
        {itemDialog && (
          <PriceItemForm
            companyId={companyId}
            item={itemDialog === 'new' ? undefined : itemDialog}
            standardMarkupEnabled={standardMarkupEnabled}
            standardMarkupPct={standardMarkupPct}
            customerGroups={groups}
            suppliers={suppliers}
            onSuccess={() => { setItemDialog(null); router.refresh() }}
          />
        )}
      </Dialog>
      <Dialog open={!!kitDialog} onClose={() => setKitDialog(null)} title={kitDialog === 'new' ? 'Add kit' : 'Edit kit'} className="max-w-3xl">
        {kitDialog && (
          <KitForm
            companyId={companyId}
            kit={kitDialog === 'new' ? undefined : kitDialog}
            items={availableItems}
            standardMarkupEnabled={standardMarkupEnabled}
            standardMarkupPct={standardMarkupPct}
            onItemCreated={item => setAvailableItems(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)))}
            onSuccess={() => { setKitDialog(null); router.refresh() }}
          />
        )}
      </Dialog>
    </div>
  )
}

function PriceItemForm({ companyId, item, standardMarkupEnabled, standardMarkupPct, customerGroups, suppliers, onSuccess }: { companyId: string; item?: PriceListItem; standardMarkupEnabled: boolean; standardMarkupPct: number; customerGroups: { id: string; name: string }[]; suppliers: { id: string; name: string }[]; onSuccess: () => void }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [groupPrices, setGroupPrices] = useState<Record<string, string>>(() => {
    const rows = item?.customer_group_prices ?? []
    return Object.fromEntries(rows.map(row => [row.customer_group_id, String(row.sell_price)]))
  })
  const [form, setForm] = useState({
    type: item?.type ?? 'material',
    code: item?.code ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    unit: item?.unit ?? 'each',
    cost_price: item?.cost_price?.toString() ?? '0',
    sell_price: item?.sell_price?.toString() ?? '0',
    supplier_id: item?.supplier_id ?? '',
    quantity_on_hand: item?.quantity_on_hand?.toString() ?? '',
    low_stock_threshold: item?.low_stock_threshold?.toString() ?? '',
    is_active: item?.is_active ?? true,
  })

  function set(k: string, v: string | boolean) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (standardMarkupEnabled && k === 'cost_price' && (!next.sell_price || Number(next.sell_price) === 0)) {
        const cost = parseFloat(String(v)) || 0
        next.sell_price = cost ? (cost * (1 + standardMarkupPct / 100)).toFixed(2) : '0'
      }
      return next
    })
  }

  function setGroupPrice(groupId: string, value: string) {
    setGroupPrices(prev => ({ ...prev, [groupId]: value }))
  }

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
      sell_price: parseFloat(form.sell_price) || (standardMarkupEnabled ? Number(((parseFloat(form.cost_price) || 0) * (1 + standardMarkupPct / 100)).toFixed(2)) : 0),
      supplier_id: form.supplier_id || null,
      // keep the legacy free-text field in sync for display/back-compat
      supplier_name: suppliers.find(s => s.id === form.supplier_id)?.name ?? null,
      quantity_on_hand: form.quantity_on_hand !== '' ? parseFloat(form.quantity_on_hand) : null,
      low_stock_threshold: form.low_stock_threshold !== '' ? parseFloat(form.low_stock_threshold) : null,
      is_active: form.is_active,
    }
    const saved = item
      ? await supabase.from('price_list_items').update(payload).eq('id', item.id).select('id').single()
      : await supabase.from('price_list_items').insert(payload).select('id').single()
    if (saved.error) toast(saved.error.message, 'error')
    else {
      const itemId = saved.data!.id
      const rows = Object.entries(groupPrices)
        .map(([customer_group_id, raw]) => ({ customer_group_id, price_list_item_id: itemId, sell_price: Number(raw) }))
        .filter(row => Number.isFinite(row.sell_price) && row.sell_price > 0)
      const emptyGroupIds = Object.entries(groupPrices)
        .filter(([, raw]) => !raw || Number(raw) <= 0)
        .map(([groupId]) => groupId)
      if (rows.length) {
        const { error } = await supabase.from('customer_group_prices').upsert(rows)
        if (error) { toast(error.message, 'error'); setLoading(false); return }
      }
      if (emptyGroupIds.length) {
        await supabase
          .from('customer_group_prices')
          .delete()
          .eq('price_list_item_id', itemId)
          .in('customer_group_id', emptyGroupIds)
      }
      toast(item ? 'Item updated' : 'Item added'); onSuccess()
    }
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
      {customerGroups.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3">
          <Label>Pricing levels</Label>
          <p className="text-xs text-gray-500 mb-3">Optional sell price overrides for customer groups.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customerGroups.map(group => (
              <div key={group.id}>
                <Label>{group.name}</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={form.sell_price}
                  value={groupPrices[group.id] ?? ''}
                  onChange={e => setGroupPrice(group.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <Label>Supplier</Label>
        <Select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}
          placeholder="No supplier"
          options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
        <p className="mt-1 text-xs text-gray-400">Sets who to order this part from — powers one-click &ldquo;Order parts&rdquo; on accepted quotes.</p>
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

function KitForm({
  companyId,
  kit,
  items,
  standardMarkupEnabled,
  standardMarkupPct,
  onItemCreated,
  onSuccess,
}: {
  companyId: string
  kit?: Kit
  items: PriceListItem[]
  standardMarkupEnabled: boolean
  standardMarkupPct: number
  onItemCreated: (item: PriceListItem) => void
  onSuccess: () => void
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showNewItem, setShowNewItem] = useState(false)
  const [form, setForm] = useState({
    code: kit?.code ?? '',
    name: kit?.name ?? '',
    description: kit?.description ?? '',
    sell_price: String(kit?.sell_price ?? 0),
    use_item_sell_total: !!kit?.use_item_sell_total,
  })
  const [components, setComponents] = useState<Array<{ price_list_item_id: string; quantity: string }>>(
    (kit?.kit_items ?? []).map(ki => ({ price_list_item_id: ki.price_list_item_id, quantity: String(ki.quantity) }))
  )
  const [newItem, setNewItem] = useState({
    type: 'material',
    code: '',
    name: '',
    unit: 'each',
    cost_price: '0',
    sell_price: '0',
    quantity_on_hand: '',
  })

  function itemSell(item: PriceListItem) {
    return Number(item.sell_price) || (standardMarkupEnabled ? Number((Number(item.cost_price) * (1 + standardMarkupPct / 100)).toFixed(2)) : 0)
  }

  const selected = components
    .map(component => ({ ...component, item: items.find(item => item.id === component.price_list_item_id) }))
    .filter((component): component is { price_list_item_id: string; quantity: string; item: PriceListItem } => !!component.item)
  const componentCost = selected.reduce((sum, component) => sum + (parseFloat(component.quantity) || 0) * Number(component.item.cost_price), 0)
  const componentSell = selected.reduce((sum, component) => sum + (parseFloat(component.quantity) || 0) * itemSell(component.item), 0)
  const effectiveSell = form.use_item_sell_total ? componentSell : (parseFloat(form.sell_price) || 0)

  function updateComponent(index: number, key: 'price_list_item_id' | 'quantity', value: string) {
    setComponents(prev => prev.map((component, i) => i === index ? { ...component, [key]: value } : component))
  }

  async function createStandardItem() {
    if (!newItem.name.trim()) return
    const cost = parseFloat(newItem.cost_price) || 0
    const payload = {
      company_id: companyId,
      type: newItem.type as PriceListItem['type'],
      code: newItem.code || null,
      name: newItem.name.trim(),
      unit: newItem.unit || 'each',
      cost_price: cost,
      sell_price: parseFloat(newItem.sell_price) || (standardMarkupEnabled ? Number((cost * (1 + standardMarkupPct / 100)).toFixed(2)) : 0),
      quantity_on_hand: newItem.quantity_on_hand !== '' ? parseFloat(newItem.quantity_on_hand) : null,
      is_active: true,
    }
    const { data, error } = await supabase.from('price_list_items').insert(payload).select('*').single()
    if (error) { toast(error.message, 'error'); return }
    onItemCreated(data as PriceListItem)
    setComponents(prev => [...prev, { price_list_item_id: data.id, quantity: '1' }])
    setNewItem({ type: 'material', code: '', name: '', unit: 'each', cost_price: '0', sell_price: '0', quantity_on_hand: '' })
    setShowNewItem(false)
    toast('Standard item added')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    const validComponents = components.filter(component => component.price_list_item_id && (parseFloat(component.quantity) || 0) > 0)
    setLoading(true)
    const payload = {
      company_id: companyId,
      code: form.code || null,
      name: form.name.trim(),
      description: form.description || null,
      sell_price: form.use_item_sell_total ? componentSell : (parseFloat(form.sell_price) || 0),
      use_item_sell_total: form.use_item_sell_total,
    }
    const saved = kit
      ? await supabase.from('kits').update(payload).eq('id', kit.id).select('id').single()
      : await supabase.from('kits').insert(payload).select('id').single()
    if (saved.error) { toast(saved.error.message, 'error'); setLoading(false); return }

    const kitId = saved.data!.id
    if (kit) await supabase.from('kit_items').delete().eq('kit_id', kitId)
    if (validComponents.length > 0) {
      const { error } = await supabase.from('kit_items').insert(validComponents.map((component, index) => ({
        kit_id: kitId,
        price_list_item_id: component.price_list_item_id,
        quantity: parseFloat(component.quantity) || 1,
        sort_order: index,
      })))
      if (error) { toast(error.message, 'error'); setLoading(false); return }
    }
    toast(kit ? 'Kit updated' : 'Kit added')
    onSuccess()
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Kit name <span className="text-red-400">*</span></Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </div>
        <div>
          <Label>SKU / code</Label>
          <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="KIT-001" />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Kit cost</Label>
          <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">{formatCurrency(componentCost)}</div>
        </div>
        <div>
          <Label>Kit sell price</Label>
          <Input type="number" step="0.01" value={form.use_item_sell_total ? componentSell.toFixed(2) : form.sell_price} disabled={form.use_item_sell_total} onChange={e => setForm(f => ({ ...f, sell_price: e.target.value }))} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.use_item_sell_total} onChange={e => setForm(f => ({ ...f, use_item_sell_total: e.target.checked }))} className="rounded" />
          Sum item sell prices
        </label>
      </div>
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Label>Kit items</Label>
            <p className="text-xs text-gray-500">Choose standard price-list items. Their costs make up the kit cost and their stock is consumed when the kit is used.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowNewItem(v => !v)}>
            <Plus className="h-4 w-4" /> New standard item
          </Button>
        </div>
        <div className="space-y-2">
          {components.map((component, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_2rem] gap-2">
              <Select value={component.price_list_item_id} onChange={e => updateComponent(index, 'price_list_item_id', e.target.value)} options={[{ value: '', label: 'Select item...' }, ...items.map(item => ({ value: item.id, label: `${item.name}${item.code ? ` (${item.code})` : ''}` }))]} />
              <Input type="number" step="0.01" value={component.quantity} onChange={e => updateComponent(index, 'quantity', e.target.value)} />
              <button type="button" onClick={() => setComponents(prev => prev.filter((_, i) => i !== index))} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setComponents(prev => [...prev, { price_list_item_id: '', quantity: '1' }])}>Add existing item</Button>
        </div>
      </div>
      {showNewItem && (
        <div className="rounded-lg border border-dashed border-gray-300 p-3 space-y-3">
          <p className="text-sm font-medium text-gray-700">Create a standard price-list item</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Name" value={newItem.name} onChange={e => setNewItem(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Code" value={newItem.code} onChange={e => setNewItem(f => ({ ...f, code: e.target.value }))} />
            <Select value={newItem.type} onChange={e => setNewItem(f => ({ ...f, type: e.target.value }))} options={[{ value: 'material', label: 'Material' }, { value: 'labour', label: 'Labour' }, { value: 'misc', label: 'Misc' }]} />
            <Input placeholder="Unit" value={newItem.unit} onChange={e => setNewItem(f => ({ ...f, unit: e.target.value }))} />
            <Input type="number" step="0.01" placeholder="Cost price" value={newItem.cost_price} onChange={e => setNewItem(f => ({ ...f, cost_price: e.target.value }))} />
            <Input type="number" step="0.01" placeholder="Sell price" value={newItem.sell_price} onChange={e => setNewItem(f => ({ ...f, sell_price: e.target.value }))} />
            <Input type="number" step="0.01" placeholder="Qty on hand" value={newItem.quantity_on_hand} onChange={e => setNewItem(f => ({ ...f, quantity_on_hand: e.target.value }))} />
          </div>
          <Button type="button" size="sm" onClick={createStandardItem}>Create item and add to kit</Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Kit sell price: <span className="font-semibold text-gray-900">{formatCurrency(effectiveSell)}</span></p>
        <Button type="submit" loading={loading}>{kit ? 'Save kit' : 'Add kit'}</Button>
      </div>
    </form>
  )
}
