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
  unit_cost?: number | null
  price_list_item_id: string | null
  markup_pct?: number | null
  cost_category_id?: string | null
}
type CostCategory = { id: string; name: string }
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
  is_assembly?: boolean | null
  assembly_unit?: string | null
  kit_items: { quantity: number; waste_pct?: number | null; price_list_items: PriceItem | null }[]
}

interface Props {
  jobId: string
  companyId: string
  profileId: string
  materials: Material[]
  priceItems: PriceItem[]
  costCategories?: CostCategory[]
  kits?: Kit[]
  quoteLines?: QuoteLine[]
  quoteNumber?: string | null
  standardMarkupEnabled?: boolean
  standardMarkupPct?: number
  /** Company toggle (Settings) AND caller is owner/admin — computed by the page. */
  canMarkupItems?: boolean
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

export function JobMaterials({ jobId, companyId, profileId, materials: initialMaterials, priceItems, costCategories = [], kits = [], quoteLines = [], quoteNumber, standardMarkupEnabled = false, standardMarkupPct = 80, canMarkupItems = false }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [materials, setMaterials] = useState(initialMaterials)
  const [showForm, setShowForm] = useState(true)
  const [picker, setPicker] = useState<'items' | 'kits' | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ price_list_item_id: '', description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0', markup_pct: '', cost_category_id: '' })
  const qtyRef = useRef<HTMLInputElement>(null)
  const unitRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)
  const markupRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  // When a markup % is entered, unit_price is derived from cost — the two
  // stay linked for as long as markup_pct is set. Clearing markup_pct hands
  // control back to typing unit_price directly, same as when the feature is
  // off entirely.
  function setCost(v: string) {
    setForm(f => {
      const markup = parseFloat(f.markup_pct)
      const cost = parseFloat(v) || 0
      const price = f.markup_pct.trim() && !Number.isNaN(markup) ? (cost * (1 + markup / 100)).toFixed(2) : f.unit_price
      return { ...f, unit_cost: v, unit_price: price }
    })
  }
  function setMarkup(v: string) {
    setForm(f => {
      const markup = parseFloat(v)
      const cost = parseFloat(f.unit_cost) || 0
      const price = v.trim() && !Number.isNaN(markup) ? (cost * (1 + markup / 100)).toFixed(2) : f.unit_price
      return { ...f, markup_pct: v, unit_price: price }
    })
  }

  // The background router.refresh() re-renders this component with a fresh
  // `materials` prop straight from the DB — accept it as the source of truth
  // once it lands, replacing our optimistic guess.
  useEffect(() => { setMaterials(initialMaterials) }, [initialMaterials])

  const filteredItems = priceItems.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code ?? '').toLowerCase().includes(search.toLowerCase()))
  const filteredKits = kits.filter(k => !search || k.name.toLowerCase().includes(search.toLowerCase()) || (k.code ?? '').toLowerCase().includes(search.toLowerCase()))
  const total = materials.reduce((sum, m) => sum + Number(m.quantity) * Number(m.unit_price), 0)
  function costCategoryName(id: string) {
    return costCategories.find(c => c.id === id)?.name
  }

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
      markup_pct: canMarkupItems && form.markup_pct.trim() ? parseFloat(form.markup_pct) : null,
      cost_category_id: form.cost_category_id || null,
    }).select('id, description, quantity, unit, unit_price, unit_cost, price_list_item_id, markup_pct, cost_category_id').single()
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, data])
    setForm({ price_list_item_id: '', description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0', markup_pct: '', cost_category_id: '' })
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

  // For an assembly kit, kit_items.quantity means "per 1 assembly_unit" and
  // waste_pct adds wastage on top — ask how many units this job needs and
  // fold that + wastage into a single per-component multiplier. A normal
  // (non-assembly) kit always gets multiplier 1 with 0 waste, so every
  // formula below reduces to exactly today's behaviour for it.
  function assemblyQty(kit: Kit): number | null {
    if (!kit.is_assembly) return 1
    const raw = window.prompt(`How many ${kit.assembly_unit || 'units'} of "${kit.name}"?`, '1')
    if (raw === null) return null
    const qty = parseFloat(raw)
    return qty > 0 ? qty : null
  }
  function componentQty(ki: { quantity: number; waste_pct?: number | null }, drivingQty: number) {
    return Number(ki.quantity) * drivingQty * (1 + Number(ki.waste_pct ?? 0) / 100)
  }

  async function addKit(kit: Kit) {
    const drivingQty = assemblyQty(kit)
    if (drivingQty === null) return
    const components = kit.kit_items.filter(ki => ki.price_list_items)
    for (const component of components) {
      if (!confirmStock(component.price_list_items!, componentQty(component, drivingQty))) return
    }
    if (components.length === 0) return
    // Add the kit as a single line — kit name + kit price — not its components.
    // Stock is still consumed per underlying component below. For an assembly,
    // the per-component sums below are already "per 1 unit" (kit_items.quantity's
    // own meaning), so unit_cost/unit_price stay per-unit and quantity carries
    // the driving amount — the line reads "12 m² @ $x" rather than "1 kit".
    const kitCostPerUnit = components.reduce((sum, ki) => sum + Number(ki.price_list_items!.cost_price) * Number(ki.quantity) * (1 + Number(ki.waste_pct ?? 0) / 100), 0)
    const kitSellPerUnit = kit.use_item_sell_total
      ? components.reduce((sum, ki) => sum + sellPrice(ki.price_list_items!, standardMarkupEnabled, standardMarkupPct) * Number(ki.quantity) * (1 + Number(ki.waste_pct ?? 0) / 100), 0)
      : Number(kit.sell_price ?? 0)
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert({
      job_id: jobId,
      company_id: companyId,
      added_by: profileId,
      price_list_item_id: null,
      description: kit.code ? `${kit.name} (${kit.code})` : kit.name,
      quantity: kit.is_assembly ? drivingQty : 1,
      unit: kit.is_assembly ? (kit.assembly_unit || 'unit') : 'kit',
      unit_cost: Number(kitCostPerUnit.toFixed(2)),
      unit_price: Number(kitSellPerUnit.toFixed(2)),
    }).select('id, description, quantity, unit, unit_price, price_list_item_id').single()
    setLoading(false)
    if (error) return
    setMaterials(prev => [...prev, data])
    setPicker(null)
    setSearch('')
    void consumeStock(components.map(ki => ({ item_id: ki.price_list_items!.id, quantity: componentQty(ki, drivingQty) })))
    router.refresh()
  }

  // Explode a kit into its individual component lines instead of one bundle
  // row — so a tech can delete or swap a single component on site without
  // touching the others. Each line is a normal tracked price-list item priced
  // at its own standard sell, so stock and job-costing stay accurate.
  async function addKitAsItems(kit: Kit) {
    const drivingQty = assemblyQty(kit)
    if (drivingQty === null) return
    const components = kit.kit_items.filter(ki => ki.price_list_items)
    if (components.length === 0) return
    for (const c of components) {
      if (!confirmStock(c.price_list_items!, componentQty(c, drivingQty))) return
    }
    setLoading(true)
    const { data, error } = await supabase.from('job_materials').insert(
      components.map(c => ({
        job_id: jobId,
        company_id: companyId,
        added_by: profileId,
        price_list_item_id: c.price_list_items!.id,
        description: c.price_list_items!.name,
        quantity: componentQty(c, drivingQty),
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
    void consumeStock(components.map(c => ({ item_id: c.price_list_items!.id, quantity: componentQty(c, drivingQty) })))
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
              {canMarkupItems && <th className="text-right px-3 py-2 font-medium w-24">Cost</th>}
              {canMarkupItems && <th className="text-right px-3 py-2 font-medium w-20">Markup %</th>}
              <th className="text-right px-3 py-2 font-medium w-28">Unit price</th>
              <th className="text-right px-6 py-2 font-medium w-28">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {materials.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-6 py-2.5 text-gray-700">
                  {m.description}
                  {m.cost_category_id && costCategoryName(m.cost_category_id) && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                      {costCategoryName(m.cost_category_id)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600">{m.quantity}</td>
                <td className="px-3 py-2.5 text-gray-400">{m.unit}</td>
                {canMarkupItems && <td className="px-3 py-2.5 text-right text-gray-400">{m.unit_cost != null ? formatCurrency(m.unit_cost) : '—'}</td>}
                {canMarkupItems && <td className="px-3 py-2.5 text-right text-gray-400">{m.markup_pct != null ? `${m.markup_pct}%` : '—'}</td>}
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
                  {costCategories.length > 0 && (
                    <select
                      value={form.cost_category_id}
                      onChange={e => set('cost_category_id', e.target.value)}
                      className="mt-1 h-6 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-500"
                    >
                      <option value="">No category</option>
                      {costCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2"><input ref={qtyRef} type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={form.quantity} onChange={e => set('quantity', e.target.value)} onKeyDown={e => moveOnEnter(e, unitRef)} /></td>
                <td className="px-3 py-2"><input ref={unitRef} className="h-8 w-full rounded-lg border border-gray-200 px-2 text-sm" value={form.unit} onChange={e => set('unit', e.target.value)} onKeyDown={e => moveOnEnter(e, canMarkupItems ? costRef : priceRef)} /></td>
                {canMarkupItems && <td className="px-3 py-2"><input ref={costRef} type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={form.unit_cost} onChange={e => setCost(e.target.value)} onKeyDown={e => moveOnEnter(e, markupRef)} /></td>}
                {canMarkupItems && <td className="px-3 py-2"><input ref={markupRef} type="number" step="0.1" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={form.markup_pct} onChange={e => setMarkup(e.target.value)} onKeyDown={e => moveOnEnter(e, priceRef)} /></td>}
                <td className="px-3 py-2"><input ref={priceRef} type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={form.unit_price} onChange={e => set('unit_price', e.target.value)} onKeyDown={moveOnEnter} /></td>
                <td className="px-6 py-2 text-right font-medium text-gray-800">{formatCurrency((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}</td>
                <td className="py-2 pr-2" />
              </tr>
            )}
          </tbody>
          {materials.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-100">
                <td colSpan={canMarkupItems ? 6 : 4} className="px-6 py-2 text-right text-xs text-gray-500 font-medium">Total</td>
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
          <button onClick={() => setForm({ price_list_item_id: '', description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0', markup_pct: '', cost_category_id: '' })} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Clear</button>
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
                <span className="text-gray-800 truncate">{kit.name}<span className="ml-2 text-xs text-gray-400">{kit.code ? `${kit.code} · ` : ''}{kit.is_assembly ? `per ${kit.assembly_unit || 'unit'} · ` : `${formatCurrency(Number(kit.sell_price ?? 0))} · `}{kit.kit_items.length} item{kit.kit_items.length === 1 ? '' : 's'}</span></span>
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
          <button onClick={() => { setShowForm(true); setForm({ price_list_item_id: '', description: 'Sundries', quantity: '1', unit: 'item', unit_cost: '0', unit_price: '0', markup_pct: '', cost_category_id: '' }) }} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
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
