'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Upload, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface ParsedItem {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  line_total: number
  part_number: string | null
}

interface ParsedInvoice {
  supplier: string
  invoice_number: string | null
  invoice_date: string | null
  total: number
  items: ParsedItem[]
}

interface SavedItem extends ParsedItem {
  selected: boolean
  matched_price_item_id: string | null
}

interface PriceItem { id: string; name: string; cost_price: number }

interface Props {
  jobId: string
  companyId: string
  priceItems: PriceItem[]
  onSaved?: () => void
}

export function SupplierInvoiceParser({ jobId, companyId, priceItems, onSaved }: Props) {
  const [stage, setStage] = useState<'idle' | 'parsing' | 'review' | 'saving' | 'done' | 'error'>('idle')
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null)
  const [items, setItems] = useState<SavedItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleFile(file: File) {
    setStage('parsing')
    setError(null)
    const fd = new FormData()
    fd.append('file', file)

    const res = await fetch('/api/supplier-invoice/parse', { method: 'POST', body: fd })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to parse invoice')
      setStage('error')
      return
    }

    const invoice = data as ParsedInvoice
    setParsed(invoice)

    // Auto-match items to price list by fuzzy name match
    const savedItems: SavedItem[] = invoice.items.map(item => {
      const desc = item.description.toLowerCase()
      const match = priceItems.find(p => {
        const n = p.name.toLowerCase()
        return desc.includes(n) || n.includes(desc.slice(0, 12))
      })
      return { ...item, selected: true, matched_price_item_id: match?.id ?? null }
    })
    setItems(savedItems)
    setStage('review')
  }

  function toggleItem(i: number) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item))
  }

  function updateItem(i: number, field: keyof ParsedItem, value: string | number) {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: value }
      if (field === 'quantity' || field === 'unit_cost') {
        updated.line_total = Number(updated.quantity) * Number(updated.unit_cost)
      }
      return updated
    }))
  }

  async function save() {
    const toSave = items.filter(i => i.selected)
    if (toSave.length === 0) return
    setStage('saving')

    const rows = toSave.map(item => ({
      job_id: jobId,
      company_id: companyId,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost: item.unit_cost,
      sell_price: item.unit_cost,
      price_item_id: item.matched_price_item_id,
      supplier: parsed?.supplier ?? null,
      supplier_invoice_number: parsed?.invoice_number ?? null,
    }))

    const { error: err } = await supabase.from('job_materials').insert(rows)
    if (err) {
      setError(err.message)
      setStage('error')
      return
    }
    setStage('done')
    onSaved?.()
  }

  if (stage === 'done') {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm px-4 py-3">
        <CheckCircle className="h-4 w-4" />
        Materials imported from supplier invoice
      </div>
    )
  }

  if (stage === 'idle' || stage === 'error') {
    return (
      <div className="px-4 py-3">
        <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg px-4 py-2.5 hover:border-gray-400 transition-colors w-full justify-center"
        >
          <Upload className="h-4 w-4" />
          Upload supplier invoice (PDF or image) to auto-import materials
        </button>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    )
  }

  if (stage === 'parsing') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reading invoice with AI...
      </div>
    )
  }

  if (stage === 'saving') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving materials...
      </div>
    )
  }

  // Review stage
  const selectedCount = items.filter(i => i.selected).length
  const selectedTotal = items.filter(i => i.selected).reduce((s, i) => s + i.line_total, 0)

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-800">Review extracted items</span>
          {parsed?.supplier && <span className="text-xs text-gray-400">from {parsed.supplier}</span>}
          {parsed?.invoice_number && <span className="text-xs text-gray-400">· {parsed.invoice_number}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{selectedCount} of {items.length} selected · {formatCurrency(selectedTotal)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-400 font-medium">
                <th className="px-4 py-2 text-left w-8"></th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-right w-20">Qty</th>
                <th className="px-4 py-2 text-left w-16">Unit</th>
                <th className="px-4 py-2 text-right w-24">Unit cost</th>
                <th className="px-4 py-2 text-right w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item, i) => (
                <tr key={i} className={`${item.selected ? '' : 'opacity-40'}`}>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={item.selected} onChange={() => toggleItem(i)} className="rounded" />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={item.description}
                      onChange={e => updateItem(i, 'description', e.target.value)}
                      className="w-full bg-transparent text-gray-700 border-b border-transparent hover:border-gray-200 focus:border-[var(--accent,#f97316)]/40 outline-none py-0.5"
                    />
                    {item.part_number && <span className="text-gray-400 block">{item.part_number}</span>}
                    {item.matched_price_item_id && <span className="text-green-500 text-xs">✓ matched to price list</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-16 text-right bg-transparent text-gray-700 border-b border-transparent hover:border-gray-200 focus:border-[var(--accent,#f97316)]/40 outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 text-gray-500">{item.unit}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={item.unit_cost}
                      step="0.01"
                      onChange={e => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                      className="w-20 text-right bg-transparent text-gray-700 border-b border-transparent hover:border-gray-200 focus:border-[var(--accent,#f97316)]/40 outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button onClick={() => setStage('idle')} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              onClick={save}
              disabled={selectedCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent,#f97316)] text-white text-xs font-medium rounded-lg hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Add {selectedCount} item{selectedCount !== 1 ? 's' : ''} to job
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
