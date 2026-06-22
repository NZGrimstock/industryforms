'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Package, Search, FileDown } from 'lucide-react'

type PriceItem = { id: string; name: string; unit: string; sell_price: number; cost_price: number; type: string }
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

interface Props {
  jobId: string
  companyId: string
  profileId: string
  materials: Material[]
  priceItems: PriceItem[]
  quoteLines?: QuoteLine[]
  quoteNumber?: string | null
}

export function JobMaterials({ jobId, companyId, profileId, materials, priceItems, quoteLines = [], quoteNumber }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [showPriceList, setShowPriceList] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0' })

  const filtered = priceItems.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  async function addManual() {
    if (!form.description.trim()) return
    setLoading(true)
    await supabase.from('job_materials').insert({
      job_id: jobId,
      company_id: companyId,
      added_by: profileId,
      description: form.description,
      quantity: parseFloat(form.quantity) || 1,
      unit: form.unit,
      unit_cost: parseFloat(form.unit_cost) || 0,
      unit_price: parseFloat(form.unit_price) || 0,
    })
    setLoading(false)
    setShowForm(false)
    setForm({ description: '', quantity: '1', unit: 'each', unit_cost: '0', unit_price: '0' })
    router.refresh()
  }

  async function addFromPrice(item: PriceItem) {
    setLoading(true)
    await supabase.from('job_materials').insert({
      job_id: jobId,
      company_id: companyId,
      added_by: profileId,
      price_list_item_id: item.id,
      description: item.name,
      quantity: 1,
      unit: item.unit,
      unit_cost: item.cost_price,
      unit_price: item.sell_price,
    })
    setLoading(false)
    setShowPriceList(false)
    setSearch('')
    router.refresh()
  }

  async function fillFromQuote() {
    if (quoteLines.length === 0) return
    if (materials.length > 0 && !confirm('Add all line items from the quote to this job? Existing materials will be kept.')) return
    setLoading(true)
    await supabase.from('job_materials').insert(
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
    )
    setLoading(false)
    router.refresh()
  }

  async function remove(id: string) {
    await supabase.from('job_materials').delete().eq('id', id)
    router.refresh()
  }

  const total = materials.reduce((sum, m) => sum + Number(m.quantity) * Number(m.unit_price), 0)

  return (
    <div>
      {materials.length === 0 && !showForm && !showPriceList ? (
        <div className="px-6 py-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-400">No materials recorded</p>
          {quoteLines.length > 0 && (
            <button onClick={fillFromQuote} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent,#f97316)] hover:text-[var(--accent,#f97316)] disabled:opacity-50">
              <FileDown className="h-3.5 w-3.5" /> {loading ? 'Filling…' : `Fill from quote${quoteNumber ? ` ${quoteNumber}` : ''}`}
            </button>
          )}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
              <th className="text-left px-6 py-2 font-medium">Description</th>
              <th className="text-right px-4 py-2 font-medium w-16">Qty</th>
              <th className="text-left px-2 py-2 font-medium w-14">Unit</th>
              <th className="text-right px-4 py-2 font-medium w-24">Price</th>
              <th className="text-right px-6 py-2 font-medium w-24">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {materials.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-6 py-2.5 text-gray-700">{m.description}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{m.quantity}</td>
                <td className="px-2 py-2.5 text-gray-400">{m.unit}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(m.unit_price)}</td>
                <td className="px-6 py-2.5 text-right font-medium text-gray-800">{formatCurrency(Number(m.quantity) * Number(m.unit_price))}</td>
                <td className="py-2.5 pr-2">
                  <button onClick={() => remove(m.id)} className="text-gray-300 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
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

      {/* Manual entry form */}
      {showForm && (
        <div className="mx-6 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Material name..." autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input type="number" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cost price</label>
              <input type="number" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sell price</label>
              <input type="number" step="0.01" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addManual} disabled={loading || !form.description.trim()} className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg disabled:opacity-50">
              {loading ? 'Adding…' : 'Add material'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Price list picker */}
      {showPriceList && (
        <div className="mx-6 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white" placeholder="Search price list…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {filtered.map(item => (
              <button key={item.id} onClick={() => addFromPrice(item)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-800">{item.name}</span>
                  <span className="text-xs text-gray-400 ml-2 capitalize">{item.type} · {item.unit}</span>
                </div>
                <span className="text-gray-600 font-medium">{formatCurrency(item.sell_price)}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No items found</p>}
          </div>
          <button onClick={() => setShowPriceList(false)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      )}

      {/* Add buttons */}
      {!showForm && !showPriceList && (
        <div className="px-6 py-2 flex gap-2">
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
            <Plus className="h-3.5 w-3.5" /> Add material
          </button>
          {priceItems.length > 0 && (
            <button onClick={() => setShowPriceList(true)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
              <Package className="h-3.5 w-3.5" /> From price list
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
