'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Package, Search, FileDown } from 'lucide-react'

type PriceItem = {
  id: string
  code: string | null
  name: string
  unit: string
  sell_price: number
  cost_price: number
  type: string
  quantity_on_hand: number | null
}
type Material = {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  price_list_item_id: string | null
}
type QuoteLine = {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  unit_price: number
  type: string
  price_list_item_id: string | null
}
type Kit = {
  id: string
  code?: string | null
  name: string
  sell_price?: number | null
  use_item_sell_total?: boolean | null
  kit_items: { quantity: number; price_list_items: PriceItem | null }[]
}

interface Props {
  jobId: string
  companyId: string
  profileId: string
  materials: Material[]
  priceItems: PriceItem[]
  kits?: Kit[]
  quoteLines?: QuoteLine[]
  quoteNumber?: string | null
  standardMarkupEnabled?: boolean
  standardMarkupPct?: number
}

// The dollar figures elsewhere on the job page (job costing, profitability,
// invoice-from-actuals) are computed server-side from these same rows, so a
// background router.refresh() still runs after every mutation to keep those
// in sync — it just no longer blocks the add/remove button, since the row
// itself is applied to local state immediately.

function sellPrice(item: PriceItem, standardMarkupEnabled: boolean, standardMarkupPct: number) {
  return Number(item.sell_price) || (standardMarkupEnabled ? Number((Number(item.cost_price) * (1 + standardMarkupPct / 100)).toFixed(2)) : Number(item.cost_price))
}

function DescriptionLookup({
  value,
  items,
  onText,
  onPick,
  onEnter,
}: {
  value: string
  items: PriceItem[]
  onText: (value: string) => void
  onPick: (item: PriceItem) => void
  onEnter: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const query = value.trim().toLowerCase()
  const matches = query
    ? items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        (item.code ?? '').toLowerCase().includes(query)
      ).slice(0, 8)
    : []

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        className="h-8 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-orange-400 focus:outline-none"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onText(e.target.value); setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
        placeholder="Description..."
      />
      {open && matches.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {matches.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onPick(item); setOpen(false) }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span>
                <span className="font-medium text-gray-800">{item.name}</span>
                <span className="ml-2 text-xs text-gray-400">{item.code || item.unit}</span>
              </span>
              <span className="text-xs text-gray-500">{formatCurrency(item.sell_price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function JobMaterials({ jobId, companyId, profileId, materials: initialMaterials, priceItems, kits = [], quoteLines = [], quoteNumber, standardMarkupEnabled = false, standardMarkupPct = 80 }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [materials, setMaterials] = useState(initialMaterials)
  const [showForm, setShowForm] = useState(true)
  const [picker, setPicker] = useState<'items' | 'kits' | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ price_list_item_id: '', description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0' })
  const qtyRef = useRef<HTMLInputElement>(null)
  const unitRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  // The background router.refresh() re-renders this component with a fresh
  // `materials` prop straight from the DB — accept it as the source of truth
  // once it lands, replacing our optimistic guess.
  useEffect(() => { setMaterials(initialMaterials) }, [initialMaterials])

  const filteredItems = priceItems.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code ?? '').toLowerCase().includes(search.toLowerCase()))
  const filteredKits = kits.filter(k => !search || k.name.toLowerCase().includes(search.toLowerCase()) || (k.code ?? '').toLowerCase().includes(search.toLowerCase()))
  const total = materials.reduce((sum, m) => sum + Number(m.quantity) * Number(m.unit_price), 0)

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setPicker(null)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function applyItem(item: PriceItem) {
    setForm(f => ({
      ...f,
      price_list_item_id: item.id,
      description: item.name,
      unit: item.unit,
      unit_cost: String(item.cost_price),
      unit_price: String(sellPrice(item, standardMarkupEnabled, standardMarkupPct)),
    }))
    setShowForm(true)
  }

  function confirmStock(item: PriceItem, qty: number) {
    if (item.quantity_on_hand !== null && Number(item.quantity_on_hand) < qty) {
      return confirm(`no stock of ${item.name} - do you wish to continue?`)
    }
    return true
  }

  async function consumeStock(lines: { item_id: string; quantity: number }[]) {
    if (lines.length === 0) return
    await supabase.rpc('consume_price_list_stock', { p_company_id: companyId, p_lines: lines })
  }

  async function addCurrent() {
    if (!form.description.trim()) return
    const qty = parseFloat(form.quantity) || 1
    const item = priceItems.find(p => p.id === form.price_list_item_id)
    if (item && !confirmStock(item, qty)) return
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert({
      job_id: jobId,
      company_id: companyId,
      added_by: profileId,
      price_list_item_id: form.price_list_item_id || null,
      description: form.description,
      quantity: qty,
      unit: form.unit,
      unit_cost: parseFloat(form.unit_cost) || 0,
      unit_price: parseFloat(form.unit_price) || 0,
    }).select('id, description, quantity, unit, unit_price, price_list_item_id').single()
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, data])
    setForm({ price_list_item_id: '', description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0' })
    setShowForm(true)
    if (item) void consumeStock([{ item_id: item.id, quantity: qty }])
    router.refresh()
  }

  function moveOnEnter(e: React.KeyboardEvent<HTMLInputElement>, next?: React.RefObject<HTMLInputElement | null>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (next?.current) next.current.focus()
    else void addCurrent()
  }

  async function addPriceItem(item: PriceItem) {
    if (!confirmStock(item, 1)) return
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert({
      job_id: jobId,
      company_id: companyId,
      added_by: profileId,
      price_list_item_id: item.id,
      description: item.name,
      quantity: 1,
      unit: item.unit,
      unit_cost: item.cost_price,
      unit_price: sellPrice(item, standardMarkupEnabled, standardMarkupPct),
    }).select('id, description, quantity, unit, unit_price, price_list_item_id').single()
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, data])
    setPicker(null)
    setSearch('')
    void consumeStock([{ item_id: item.id, quantity: 1 }])
    router.refresh()
  }

  async function addKit(kit: Kit) {
    const components = kit.kit_items.filter(ki => ki.price_list_items)
    for (const component of components) {
      if (!confirmStock(component.price_list_items!, Number(component.quantity))) return
    }
    if (components.length === 0) return
    // Add the kit as a single line — kit name + kit price — not its components.
    // Stock is still consumed per underlying component below.
    const kitCost = components.reduce((sum, ki) => sum + Number(ki.price_list_items!.cost_price) * Number(ki.quantity), 0)
    const kitSell = kit.use_item_sell_total
      ? components.reduce((sum, ki) => sum + sellPrice(ki.price_list_items!, standardMarkupEnabled, standardMarkupPct) * Number(ki.quantity), 0)
      : Number(kit.sell_price ?? 0)
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert({
      job_id: jobId,
      company_id: companyId,
      added_by: profileId,
      price_list_item_id: null,
      description: kit.code ? `${kit.name} (${kit.code})` : kit.name,
      quantity: 1,
      unit: 'kit',
      unit_cost: Number(kitCost.toFixed(2)),
      unit_price: Number(kitSell.toFixed(2)),
    }).select('id, description, quantity, unit, unit_price, price_list_item_id').single()
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, data])
    setPicker(null)
    setSearch('')
    void consumeStock(components.map(ki => ({ item_id: ki.price_list_items!.id, quantity: Number(ki.quantity) })))
    router.refresh()
  }

  // Explode a kit into its individual component lines instead of one bundle
  // row — so a tech can delete or swap a single component on site without
  // touching the others. Each line is a normal tracked price-list item priced
  // at its own standard sell, so stock and job-costing stay accurate.
  async function addKitAsItems(kit: Kit) {
    const components = kit.kit_items.filter(ki => ki.price_list_items)
    if (components.length === 0) return
    for (const c of components) {
      if (!confirmStock(c.price_list_items!, Number(c.quantity))) return
    }
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert(
      components.map(c => ({
        job_id: jobId,
        company_id: companyId,
        added_by: profileId,
        price_list_item_id: c.price_list_items!.id,
        description: c.price_list_items!.name,
        quantity: Number(c.quantity),
        unit: c.price_list_items!.unit,
        unit_cost: Number(c.price_list_items!.cost_price),
        unit_price: sellPrice(c.price_list_items!, standardMarkupEnabled, standardMarkupPct),
      }))
    ).select('id, description, quantity, unit, unit_price, price_list_item_id')
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, ...(data ?? [])])
    setPicker(null)
    setSearch('')
    void consumeStock(components.map(c => ({ item_id: c.price_list_items!.id, quantity: Number(c.quantity) })))
    router.refresh()
  }

  async function fillFromQuote() {
    if (quoteLines.length === 0) return
    if (materials.length > 0 && !confirm('Add all line items from the quote to this job? Existing materials will be kept.')) return
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert(
      quoteLines
        .filter(l => l.description.trim())
        .map(l => ({
          job_id: jobId,
          company_id: companyId,
          added_by: profileId,
          price_list_item_id: l.price_list_item_id,
          description: l.type === 'labour' ? `${l.description} (labour)` : l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_cost: l.unit_cost,
          unit_price: l.unit_price,
        }))
    ).select('id, description, quantity, unit, unit_price, price_list_item_id')
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, ...(data ?? [])])
    router.refresh()
  }

  async function remove(id: string) {
    setMaterials(prev => prev.filter(m => m.id !== id))
    await supabase.from('job_materials').delete().eq('id', id)
    router.refresh()
  }

  return (
    <div>
      {materials.length === 0 && !showForm && !picker ? (
        <div className="px-6 py-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-400">No materials recorded</p>
          {quoteLines.length > 0 && (
            <button onClick={fillFromQuote} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent,#f97316)] hover:text-[var(--accent,#f97316)] disabled:opacity-50">
              <FileDown className="h-3.5 w-3.5" /> {loading ? 'Filling...' : `Fill from quote${quoteNumber ? ` ${quoteNumber}` : ''}`}
            </button>
          )}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
              <th className="text-left px-6 py-2 font-medium">Description</th>
              <th className="text-right px-3 py-2 font-medium w-24">Qty</th>
              <th className="text-left px-3 py-2 font-medium w-20">Unit</th>
              <th className="text-right px-3 py-2 font-medium w-28">Unit price</th>
              <th className="text-right px-6 py-2 font-medium w-28">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {materials.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-6 py-2.5 text-gray-700">{m.description}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{m.quantity}</td>
                <td className="px-3 py-2.5 text-gray-400">{m.unit}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{formatCurrency(m.unit_price)}</td>
                <td className="px-6 py-2.5 text-right font-medium text-gray-800">{formatCurrency(Number(m.quantity) * Number(m.unit_price))}</td>
                <td className="py-2.5 pr-2">
                  <button onClick={() => remove(m.id)} className="text-gray-300 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
            {showForm && (
              <tr className="bg-gray-50/50">
                <td className="px-6 py-2">
                  <DescriptionLookup value={form.description} items={priceItems} onText={value => setForm(f => ({ ...f, description: value, price_list_item_id: '' }))} onPick={applyItem} onEnter={() => qtyRef.current?.focus()} />
                </td>
                <td className="px-3 py-2"><input ref={qtyRef} type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={form.quantity} onChange={e => set('quantity', e.target.value)} onKeyDown={e => moveOnEnter(e, unitRef)} /></td>
                <td className="px-3 py-2"><input ref={unitRef} className="h-8 w-full rounded-lg border border-gray-200 px-2 text-sm" value={form.unit} onChange={e => set('unit', e.target.value)} onKeyDown={e => moveOnEnter(e, priceRef)} /></td>
                <td className="px-3 py-2"><input ref={priceRef} type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} onKeyDown={moveOnEnter} /></td>
                <td className="px-6 py-2 text-right font-medium text-gray-800">{formatCurrency((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}</td>
                <td className="py-2 pr-2" />
              </tr>
            )}
          </tbody>
          {materials.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-100">
                <td colSpan={4} className="px-6 py-2 text-right text-xs text-gray-500 font-medium">Total</td>
                <td className="px-6 py-2 text-right font-semibold text-gray-900">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {showForm && (
        <div className="px-6 py-2 flex gap-2">
          <button onClick={addCurrent} disabled={loading || !form.description.trim()} className="px-3 py-1.5 text-xs font-medium bg-[var(--accent,#f97316)] text-white rounded-lg disabled:opacity-50">{loading ? 'Adding...' : 'Add item'}</button>
          <button onClick={() => setForm({ price_list_item_id: '', description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0' })} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Clear</button>
        </div>
      )}

      {picker && (
        <div className="mx-6 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white" placeholder={picker === 'kits' ? 'Search kits...' : 'Search price list...'} value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {picker === 'kits' ? filteredKits.map(kit => (
              <div key={kit.id} className="w-full px-3 py-2 rounded-lg flex items-center justify-between gap-3 text-sm hover:bg-white">
                <span className="text-gray-800 truncate">{kit.name}<span className="ml-2 text-xs text-gray-400">{kit.code ? `${kit.code} · ` : ''}{formatCurrency(Number(kit.sell_price ?? 0))} · {kit.kit_items.length} item{kit.kit_items.length === 1 ? '' : 's'}</span></span>
                <span className="flex shrink-0 items-center gap-2">
                  <button onClick={() => addKit(kit)} disabled={loading} className="rounded-md px-2 py-1 text-xs font-medium text-[var(--accent,#f97316)] hover:bg-[var(--accent,#f97316)]/10 disabled:opacity-50">Bundle</button>
                  <button onClick={() => addKitAsItems(kit)} disabled={loading} title="Add each component as its own editable line" className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50">Split</button>
                </span>
              </div>
            )) : filteredItems.map(item => (
              <button key={item.id} onClick={() => addPriceItem(item)} disabled={loading} className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-sm hover:bg-white disabled:opacity-50">
                <div>
                  <span className="text-gray-800">{item.name}</span>
                  <span className="text-xs text-gray-400 ml-2 capitalize">{item.type} · {item.unit}</span>
                </div>
                <span className="text-gray-600 font-medium">{formatCurrency(sellPrice(item, standardMarkupEnabled, standardMarkupPct))}</span>
              </button>
            ))}
            {((picker === 'kits' && filteredKits.length === 0) || (picker === 'items' && filteredItems.length === 0)) && <p className="text-sm text-gray-400 text-center py-3">No matches found</p>}
          </div>
          <button onClick={() => setPicker(null)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      )}

      {!picker && (
        <div className="px-6 py-2 flex gap-2 flex-wrap">
          <button onClick={() => { setShowForm(true); setForm({ price_list_item_id: '', description: 'Sundries', quantity: '1', unit: 'item', unit_cost: '0', unit_price: '0' }) }} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
            <Plus className="h-3.5 w-3.5" /> Add sundry
          </button>
          {priceItems.length > 0 && (
            <button onClick={() => setPicker('items')} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
              <Package className="h-3.5 w-3.5" /> Price List Lookup
            </button>
          )}
          {kits.length > 0 && (
            <button onClick={() => setPicker('kits')} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
              <Package className="h-3.5 w-3.5" /> Add kit
            </button>
          )}
          {quoteLines.length > 0 && (
            <button onClick={fillFromQuote} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium disabled:opacity-50">
              <FileDown className="h-3.5 w-3.5" /> Fill from quote
            </button>
          )}
        </div>
      )}
    </div>
  )
}
