'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PriceListItem, Kit, Customer, CustomerSite, QuoteSection, QuoteLineItem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { lineNet, computeTaxedTotals, type DiscountType } from '@/lib/pricing'
import { priceForCustomerGroup } from '@/lib/customer-pricing'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, Package, Clock } from 'lucide-react'

type DraftSection = Omit<QuoteSection, 'id'> & { id: string; lines: DraftLine[] }
type DraftLine = Omit<QuoteLineItem, 'id' | 'section_id' | 'quote_id' | 'created_at'> & { id: string }
type KitWithItems = Kit & { kit_items: ({ price_list_items: PriceListItem; quantity: number; sort_order: number; id: string; kit_id: string; price_list_item_id: string })[] }

interface EditQuoteData {
  id: string
  title: string
  customer_id: string
  site_id: string | null
  notes: string | null
  customer_message: string | null
  terms: string | null
  expires_at: string | null
  reference: string | null
  sections: Array<{
    title: string
    is_optional: boolean
    sort_order: number
    lines: Array<{
      description: string | null
      quantity: number
      unit: string | null
      unit_cost: number | null
      unit_price: number
      discount_type: string | null
      discount_value: number | null
      tax_rate: number | null
      line_total: number
      type: string
      price_list_item_id: string | null
      sort_order: number
    }>
  }>
  discount_type: string | null
  discount_value: number | null
}

interface Props {
  companyId: string
  profileId: string
  quoteNumber: string
  gstRate: number
  customers: (Customer & { customer_sites: CustomerSite[] })[]
  priceItems: PriceListItem[]
  kits: (Kit & { kit_items: ({ price_list_items: PriceListItem; quantity: number; sort_order: number; id: string; kit_id: string; price_list_item_id: string })[] })[]
  defaultCustomerId?: string
  defaultTerms?: string
  billingRates?: { id: string; name: string; rate: number }[]
  taxRates?: { id: string; name: string; rate: number }[]
  pricesIncludeTax?: boolean
  templateData?: {
    title?: string
    terms?: string
    sections: Array<{ title: string; is_optional?: boolean; lines: Array<{ description?: string; quantity?: number; unit?: string; unit_cost?: number; unit_price?: number; type?: string; discount_type?: string | null; discount_value?: number | null; tax_rate?: number | null }> }>
  }
  editQuote?: EditQuoteData
}

let idSeq = 0
function newId() { return `new-${++idSeq}` }

function emptyLine(overrides: Partial<DraftLine> = {}): DraftLine {
  return { id: newId(), price_list_item_id: null, type: 'material', description: '', quantity: 1, unit: 'each', unit_cost: 0, unit_price: 0, discount_type: null, discount_value: 0, tax_rate: null, line_total: 0, sort_order: 0, ...overrides }
}

function labourLine(): DraftLine {
  return emptyLine({ type: 'labour', description: 'Labour', unit: 'hr', quantity: 1, unit_price: 0, unit_cost: 0 })
}

function sundryLine(): DraftLine {
  return emptyLine({ type: 'misc', description: 'Sundries', unit: 'item', quantity: 1, unit_price: 0, unit_cost: 0 })
}

function emptySection(): DraftSection {
  return { id: newId(), quote_id: '', title: 'New section', is_optional: false, customer_selected: null, sort_order: 0, lines: [emptyLine()] }
}

function LineDescriptionInput({
  value,
  placeholder,
  priceItems,
  onTextChange,
  onPick,
  onEnter,
}: {
  value: string
  placeholder: string
  priceItems: PriceListItem[]
  onTextChange: (value: string) => void
  onPick: (item: PriceListItem) => void
  onEnter: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const query = value.trim().toLowerCase()
  const matches = query
    ? priceItems
        .filter(item =>
          item.name.toLowerCase().includes(query) ||
          (item.code ?? '').toLowerCase().includes(query) ||
          (item.description ?? '').toLowerCase().includes(query)
        )
        .slice(0, 8)
    : []

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  return (
    <div ref={ref} className="relative flex-1">
      <Input
        value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onTextChange(e.target.value); setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
        className="h-7 text-sm"
        placeholder={placeholder}
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
              <span className="text-xs font-medium text-gray-500">{formatCurrency(item.sell_price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Customer typeahead combobox with inline "new customer" (same as the jobs form).
function CustomerCombobox({ customers, value, onChange, companyId, onCreated }: {
  customers: (Customer & { customer_sites: CustomerSite[] })[]
  value: string
  onChange: (id: string) => void
  companyId: string
  onCreated: (c: Customer & { customer_sites: CustomerSite[] }) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = customers.find(c => c.id === value)
  const { toast } = useToast()

  useEffect(() => {
    function click(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setCreating(false) } }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  const filtered = query
    ? customers.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : customers

  async function createCustomer() {
    const name = newCust.name.trim()
    if (!name) { toast('Enter the customer name', 'error'); return }
    setSaving(true)
    const supabase = createClient()
    // Reuse an existing same-name customer to avoid duplicates (matches jobs form).
    const { data: existing } = await supabase.from('customers')
      .select('id').eq('company_id', companyId).ilike('name', name).limit(1).maybeSingle()
    if (existing) {
      setSaving(false); setCreating(false); setOpen(false)
      onChange(existing.id)
      toast('Using existing customer with that name')
      return
    }
    const { data: created, error } = await supabase.from('customers')
      .insert({ company_id: companyId, name, phone: newCust.phone.trim() || null, email: newCust.email.trim() || null })
      .select('*').single()
    setSaving(false)
    if (error || !created) { toast(error?.message ?? 'Failed to create customer', 'error'); return }
    onCreated({ ...(created as Customer), customer_sites: [] })
    setCreating(false); setOpen(false)
    setNewCust({ name: '', phone: '', email: '' })
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        placeholder="Start typing customer name…"
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && !creating && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm font-medium text-[var(--accent,#f97316)] hover:bg-orange-50 border-b border-gray-100 flex items-center gap-1.5"
            onMouseDown={e => { e.preventDefault(); setNewCust(c => ({ ...c, name: query })); setCreating(true) }}
          >
            <Plus className="h-4 w-4" /> New customer{query ? ` “${query}”` : ''}
          </button>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-2">No customers found</p>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 hover:text-[var(--accent,#f97316)]"
                onMouseDown={e => { e.preventDefault(); onChange(c.id); setOpen(false) }}
              >
                {c.name}
                {c.customer_sites.length > 0 && (
                  <span className="text-xs text-gray-400 ml-2">{c.customer_sites.length} site{c.customer_sites.length > 1 ? 's' : ''}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
      {open && creating && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2">
          <Input autoFocus placeholder="Customer name *" value={newCust.name} onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))} />
          <Input placeholder="Phone" value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} />
          <Input placeholder="Email" value={newCust.email} onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))} />
          <div className="flex gap-2">
            <Button type="button" size="sm" loading={saving} onClick={createCustomer}>Create</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function QuoteBuilder({ companyId, profileId, quoteNumber, gstRate, customers, priceItems, kits, defaultCustomerId, defaultTerms, billingRates = [], taxRates = [], pricesIncludeTax = false, templateData, editQuote }: Props) {
  const rateOf = (l: { tax_rate: number | null }) => l.tax_rate ?? gstRate
  const netOf = (qty: number, price: number, dType: DiscountType, dVal: number, rate: number) => lineNet(qty, price, dType, dVal, rate, pricesIncludeTax)
  // Tax options for the per-line picker — fall back to a standard GST + GST-free pair.
  const taxOptions = taxRates.length > 0 ? taxRates : [{ id: 'std', name: 'GST', rate: gstRate }, { id: 'free', name: 'GST Free', rate: 0 }]
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  // Stateful so inline "new customer" (in CustomerCombobox) can be added and selected.
  const [customerList, setCustomerList] = useState(customers)
  const [addItemOpen, setAddItemOpen] = useState<{ sectionId: string; mode: 'items' | 'kits' } | null>(null)
  const [priceSearch, setPriceSearch] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['main']))
  // Tracks the quote row once it exists in the DB — whether it arrived via
  // editQuote (editing) or was created by the very first autosave (new quote).
  // Once set, further saves (autosave or explicit) update it instead of
  // inserting a second row.
  const [savedId, setSavedId] = useState<string | null>(editQuote?.id ?? null)
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [meta, setMeta] = useState({
    customerId: editQuote?.customer_id ?? defaultCustomerId ?? '',
    siteId: editQuote?.site_id ?? '',
    title: editQuote?.title ?? templateData?.title ?? '',
    notes: editQuote?.notes ?? '',
    customer_message: editQuote?.customer_message ?? '',
    terms: editQuote?.terms ?? templateData?.terms ?? defaultTerms ?? '',
    expires_at: editQuote?.expires_at?.slice(0, 10) ?? '',
    reference: editQuote?.reference ?? '',
  })

  const [sections, setSections] = useState<DraftSection[]>(
    editQuote?.sections?.length
      ? editQuote.sections
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(s => ({
            id: newId(),
            quote_id: editQuote.id,
            title: s.title,
            is_optional: s.is_optional,
            customer_selected: null,
            sort_order: s.sort_order,
            lines: s.lines
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(l => emptyLine({
                price_list_item_id: l.price_list_item_id,
                type: (l.type as DraftLine['type']) ?? 'material',
                description: l.description ?? '',
                quantity: Number(l.quantity),
                unit: l.unit ?? 'each',
                unit_cost: Number(l.unit_cost ?? 0),
                unit_price: Number(l.unit_price),
                discount_type: (l.discount_type as DiscountType) ?? null,
                discount_value: Number(l.discount_value ?? 0),
                tax_rate: l.tax_rate != null ? Number(l.tax_rate) : null,
                line_total: Number(l.line_total),
              })),
          }))
      : templateData?.sections?.length
      ? templateData.sections.map((s, i) => ({
          id: newId(), quote_id: '', title: s.title, is_optional: !!s.is_optional, customer_selected: null, sort_order: i,
          lines: (s.lines ?? []).map(l => emptyLine({
            type: (l.type as DraftLine['type']) ?? 'material',
            description: l.description ?? '',
            quantity: Number(l.quantity ?? 1),
            unit: l.unit ?? 'each',
            unit_cost: Number(l.unit_cost ?? 0),
            unit_price: Number(l.unit_price ?? 0),
            discount_type: (l.discount_type as DiscountType) ?? null,
            discount_value: Number(l.discount_value ?? 0),
            tax_rate: l.tax_rate != null ? Number(l.tax_rate) : null,
            line_total: netOf(Number(l.quantity ?? 1), Number(l.unit_price ?? 0), (l.discount_type as DiscountType) ?? null, Number(l.discount_value ?? 0), l.tax_rate ?? gstRate),
          })),
        }))
      : [{ id: 'main', quote_id: '', title: 'Scope of work', is_optional: false, customer_selected: null, sort_order: 0, lines: [emptyLine()] }]
  )

  const [docDiscountType, setDocDiscountType] = useState<DiscountType>((editQuote?.discount_type as DiscountType) ?? null)
  const [docDiscountValue, setDocDiscountValue] = useState<number>(Number(editQuote?.discount_value ?? 0))

  const selectedCustomer = customerList.find(c => c.id === meta.customerId)

  function updateMeta(k: string, v: string) { setMeta(m => ({ ...m, [k]: v })) }

  function setExpiry(days: number) {
    const d = new Date(); d.setDate(d.getDate() + days)
    updateMeta('expires_at', d.toISOString().slice(0, 10))
  }

  function updateLine(sectionId: string, lineId: string, k: keyof DraftLine, v: string | number) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : {
      ...s,
      lines: s.lines.map(l => {
        if (l.id !== lineId) return l
        const updated = { ...l, [k]: v }
        if (k === 'discount_value' && Number(v) > 0 && !updated.discount_type) updated.discount_type = 'amount'
        updated.line_total = netOf(Number(updated.quantity), Number(updated.unit_price), updated.discount_type as DiscountType, Number(updated.discount_value), rateOf(updated))
        return updated
      }),
    }))
  }

  function addLine(sectionId: string) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : { ...s, lines: [...s.lines, emptyLine()] }))
  }

  function addLabour(sectionId: string) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : { ...s, lines: [...s.lines, labourLine()] }))
  }

  function focusNextLineControl(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, sectionId: string) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const row = e.currentTarget.closest('tr')
    const controls = Array.from(row?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select') ?? [])
      .filter(control => !control.disabled && control.type !== 'checkbox')
    const index = controls.indexOf(e.currentTarget)
    const next = controls[index + 1]
    if (next) next.focus()
    else addLine(sectionId)
  }

  function addSundry(sectionId: string) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : { ...s, lines: [...s.lines, sundryLine()] }))
  }

  function removeLine(sectionId: string, lineId: string) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : { ...s, lines: s.lines.filter(l => l.id !== lineId) }))
  }

  function addSection() {
    const s = emptySection()
    setSections(ss => [...ss, s])
    setExpandedSections(e => new Set([...e, s.id]))
  }

  function updateSection(id: string, k: keyof DraftSection, v: unknown) {
    setSections(ss => ss.map(s => s.id !== id ? s : { ...s, [k]: v }))
  }

  function removeSection(id: string) {
    if (sections.length === 1) return
    setSections(ss => ss.filter(s => s.id !== id))
  }

  function toggleSection(id: string) {
    setExpandedSections(e => {
      const n = new Set(e)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function priceListLine(item: PriceListItem, quantity = 1): DraftLine {
    const unitPrice = priceForCustomerGroup(item, selectedCustomer)
    return emptyLine({
      price_list_item_id: item.id, type: item.type, description: item.name,
      unit: item.unit, unit_cost: item.cost_price, unit_price: unitPrice,
      quantity, line_total: netOf(quantity, unitPrice, null, 0, gstRate),
    })
  }

  function updateLineFromPriceList(sectionId: string, lineId: string, item: PriceListItem) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : {
      ...s,
      lines: s.lines.map(l => l.id === lineId ? { ...l, ...priceListLine(item), id: l.id, sort_order: l.sort_order } : l),
    }))
  }

  function addFromPriceList(sectionId: string, item: PriceListItem) {
    setSections(ss => ss.map(s => s.id !== sectionId ? s : {
      ...s, lines: [...s.lines, priceListLine(item)]
    }))
    setAddItemOpen(null)
  }

  function addFromKit(sectionId: string, kit: KitWithItems) {
    const kitSellPrice = Number(kit.sell_price ?? 0)
    if (kitSellPrice > 0) {
      const kitCost = kit.kit_items.reduce((sum, ki) => sum + Number(ki.quantity) * Number(ki.price_list_items?.cost_price ?? 0), 0)
      setSections(ss => ss.map(s => s.id !== sectionId ? s : {
        ...s,
        lines: [...s.lines, emptyLine({
          price_list_item_id: null,
          type: 'material',
          description: kit.name,
          unit: 'kit',
          unit_cost: kitCost,
          unit_price: kitSellPrice,
          line_total: netOf(1, kitSellPrice, null, 0, gstRate),
        })],
      }))
      setAddItemOpen(null)
      return
    }
    const newLines = kit.kit_items
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter(ki => ki.price_list_items)
      .map(ki => {
        const unitPrice = priceForCustomerGroup(ki.price_list_items!, selectedCustomer)
        return emptyLine({
          price_list_item_id: ki.price_list_item_id, type: ki.price_list_items!.type,
          description: ki.price_list_items!.name, unit: ki.price_list_items!.unit,
          unit_cost: ki.price_list_items!.cost_price, unit_price: unitPrice,
          quantity: ki.quantity, line_total: netOf(ki.quantity, unitPrice, null, 0, gstRate),
        })
      })
    setSections(ss => ss.map(s => s.id !== sectionId ? s : { ...s, lines: [...s.lines, ...newLines] }))
    setAddItemOpen(null)
  }

  const totals = computeTaxedTotals(
    sections.flatMap(s => s.lines).map(l => ({ net: l.line_total, taxRate: l.tax_rate ?? gstRate })),
    docDiscountType, docDiscountValue,
  )
  const { subtotal, discount: docDiscountAmount, gst: gstAmount, total } = totals

  const save = useCallback(async (status: 'draft' | 'sent', opts: { silent?: boolean } = {}) => {
    const { silent = false } = opts
    if (!meta.customerId || !meta.title) {
      if (!silent) toast(!meta.customerId ? 'Select a customer first' : 'Enter a quote title', 'error')
      return
    }
    if (silent) setAutosaveStatus('saving'); else setSaving(true)

    const quotePayload = {
      customer_id: meta.customerId, site_id: meta.siteId || null,
      title: meta.title, status, subtotal, gst_amount: gstAmount, total,
      reference: meta.reference || null,
      discount_type: docDiscountValue > 0 ? docDiscountType : null,
      discount_value: docDiscountValue > 0 ? docDiscountValue : 0,
      discount_amount: docDiscountAmount,
      notes: meta.notes || null, customer_message: meta.customer_message || null,
      terms: meta.terms || null, expires_at: meta.expires_at || null,
    }

    let quoteId: string

    if (savedId) {
      // Update existing quote (arrived via editQuote, or created by an earlier autosave)
      const { error: ue } = await supabase.from('quotes').update(quotePayload).eq('id', savedId)
      if (ue) { if (!silent) toast(ue.message, 'error'); else setAutosaveStatus('idle'); setSaving(false); return }
      // Replace all sections and line items
      await supabase.from('quote_line_items').delete().eq('quote_id', savedId)
      await supabase.from('quote_sections').delete().eq('quote_id', savedId)
      quoteId = savedId
    } else {
      // Insert new quote
      const { data: quote, error: qe } = await supabase.from('quotes').insert({
        ...quotePayload,
        company_id: companyId, created_by: profileId, quote_number: quoteNumber,
      }).select().single()
      if (qe || !quote) { if (!silent) toast(qe?.message ?? 'Failed to save quote', 'error'); else setAutosaveStatus('idle'); setSaving(false); return }
      quoteId = quote.id
      setSavedId(quoteId)
    }

    for (let si = 0; si < sections.length; si++) {
      const s = sections[si]
      const { data: sec } = await supabase.from('quote_sections').insert({
        quote_id: quoteId, title: s.title, is_optional: s.is_optional, sort_order: si,
      }).select().single()
      if (!sec) continue
      const lineInserts = s.lines.filter(l => l.description).map((l, li) => ({
        quote_id: quoteId, section_id: sec.id, price_list_item_id: l.price_list_item_id,
        type: l.type, description: l.description, quantity: l.quantity, unit: l.unit,
        unit_cost: l.unit_cost, unit_price: l.unit_price,
        discount_type: Number(l.discount_value) > 0 ? l.discount_type : null,
        discount_value: Number(l.discount_value) > 0 ? l.discount_value : 0,
        tax_rate: l.tax_rate ?? gstRate,
        line_total: l.line_total, sort_order: li,
      }))
      if (lineInserts.length > 0) await supabase.from('quote_line_items').insert(lineInserts)
    }

    if (silent) { setAutosaveStatus('saved'); setSaving(false); return }
    toast(savedId ? 'Quote updated' : 'Quote saved')
    router.push(`/quotes/${quoteId}`)
  }, [meta, sections, subtotal, gstAmount, total, docDiscountType, docDiscountValue, docDiscountAmount, companyId, profileId, quoteNumber, supabase, toast, router, savedId, gstRate])

  // Autosave as a draft while the user is filling out the quote — needs at
  // least a customer and a title before there's anything meaningful to save.
  // Never autosaves over an in-progress "Save & send" (status stays 'draft').
  useEffect(() => {
    if (!meta.customerId || !meta.title) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => { save('draft', { silent: true }) }, 2000)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, sections, docDiscountType, docDiscountValue])

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 min-h-screen">
      <div className="flex-1 space-y-4">
        {/* Meta */}
        <Card>
          <CardHeader className="font-semibold text-sm text-gray-900">Quote details</CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Customer <span className="text-red-400">*</span></Label>
              <CustomerCombobox
                customers={customerList}
                value={meta.customerId}
                onChange={id => { updateMeta('customerId', id); updateMeta('siteId', '') }}
                companyId={companyId}
                onCreated={c => { setCustomerList(prev => [...prev, c]); updateMeta('customerId', c.id); updateMeta('siteId', '') }}
              />
            </div>
            <div>
              <Label>Job site</Label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400"
                value={meta.siteId}
                onChange={e => updateMeta('siteId', e.target.value)}
                disabled={!selectedCustomer}
              >
                <option value="">{selectedCustomer ? 'No specific site' : 'Select a customer first'}</option>
                {(selectedCustomer?.customer_sites ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.label ? `${s.label} — ${s.address}` : s.address}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Title <span className="text-red-400">*</span></Label>
              <Input value={meta.title} onChange={e => updateMeta('title', e.target.value)} placeholder="e.g. Electrical work at 12 Main St" />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={meta.reference} onChange={e => updateMeta('reference', e.target.value)} placeholder="Customer PO / your ref" />
            </div>
            <div>
              <Label>Expires</Label>
              <div className="flex gap-1.5 items-center">
                <Input type="date" value={meta.expires_at} onChange={e => updateMeta('expires_at', e.target.value)} className="flex-1" />
                <button onClick={() => setExpiry(7)} className="px-2 py-1.5 text-xs font-medium bg-gray-100 hover:bg-[var(--accent,#f97316)]/10 hover:text-[var(--accent,#f97316)] rounded-lg whitespace-nowrap transition-colors">7d</button>
                <button onClick={() => setExpiry(30)} className="px-2 py-1.5 text-xs font-medium bg-gray-100 hover:bg-[var(--accent,#f97316)]/10 hover:text-[var(--accent,#f97316)] rounded-lg whitespace-nowrap transition-colors">30d</button>
                <button onClick={() => setExpiry(90)} className="px-2 py-1.5 text-xs font-medium bg-gray-100 hover:bg-[var(--accent,#f97316)]/10 hover:text-[var(--accent,#f97316)] rounded-lg whitespace-nowrap transition-colors">90d</button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sections */}
        {sections.map(s => (
          <Card key={s.id}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
              <button onClick={() => toggleSection(s.id)} className="mr-1">
                {expandedSections.has(s.id) ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </button>
              <Input value={s.title} onChange={e => updateSection(s.id, 'title', e.target.value)} className="h-7 text-sm font-medium border-0 shadow-none p-0 focus:ring-0" />
              <div className="flex items-center gap-3 ml-auto shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={s.is_optional} onChange={e => updateSection(s.id, 'is_optional', e.target.checked)} className="rounded" />
                  Optional
                </label>
                {sections.length > 1 && (
                  <button onClick={() => removeSection(s.id)} className="text-gray-300 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>

            {expandedSections.has(s.id) && (
              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Qty</th>
                      <th className="text-left px-3 py-2 font-medium w-16">Unit</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Unit price</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Discount</th>
                      <th className="text-left px-3 py-2 font-medium w-24">Tax</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Total</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.lines.map(l => (
                      <tr key={l.id} data-line-id={l.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${l.type === 'labour' ? 'bg-blue-50/30' : ''}`}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {l.type === 'labour' && <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                            {l.type === 'labour' ? (
                              <Input value={l.description} onChange={e => updateLine(s.id, l.id, 'description', e.target.value)} onKeyDown={e => focusNextLineControl(e, s.id)} className="h-7 text-sm" placeholder="Labour description..." />
                            ) : (
                              <LineDescriptionInput
                                value={l.description}
                                placeholder="Description..."
                                priceItems={priceItems}
                                onTextChange={value => updateLine(s.id, l.id, 'description', value)}
                                onPick={item => updateLineFromPriceList(s.id, l.id, item)}
                                onEnter={() => {
                                  const row = document.querySelector(`tr[data-line-id="${l.id}"]`)
                                  const first = row?.querySelectorAll<HTMLInputElement>('input')[1]
                                  first?.focus()
                                }}
                              />
                            )}
                            {l.type === 'labour' && billingRates.length > 0 && (
                              <select
                                className="h-7 text-xs border border-gray-200 rounded px-1 text-gray-500 shrink-0"
                                value=""
                                onChange={e => { const r = billingRates.find(b => b.id === e.target.value); if (r) updateLine(s.id, l.id, 'unit_price', r.rate) }}
                                title="Apply billing rate"
                              >
                                <option value="">Rate…</option>
                                {billingRates.map(r => <option key={r.id} value={r.id}>{r.name} (${Number(r.rate).toFixed(0)})</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={l.quantity}
                            onChange={e => updateLine(s.id, l.id, 'quantity', parseFloat(e.target.value) || 0)}
                            onKeyDown={e => focusNextLineControl(e, s.id)}
                            className="h-7 text-sm text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={l.unit} onChange={e => updateLine(s.id, l.id, 'unit', e.target.value)} onKeyDown={e => focusNextLineControl(e, s.id)} className="h-7 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(s.id, l.id, 'unit_price', parseFloat(e.target.value) || 0)} onKeyDown={e => focusNextLineControl(e, s.id)} className="h-7 text-sm text-right" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Input type="number" min="0" step="any" value={l.discount_value || ''} placeholder="0" onChange={e => updateLine(s.id, l.id, 'discount_value', parseFloat(e.target.value) || 0)} onKeyDown={e => focusNextLineControl(e, s.id)} className="h-7 text-sm text-right" />
                            <button type="button" onClick={() => updateLine(s.id, l.id, 'discount_type', l.discount_type === 'percent' ? 'amount' : 'percent')} className="h-7 px-1.5 text-xs font-semibold text-gray-500 bg-gray-100 rounded hover:bg-gray-200 shrink-0" title="Toggle $ / %">
                              {l.discount_type === 'percent' ? '%' : '$'}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-7 text-xs border border-gray-200 rounded px-1 text-gray-600 w-full"
                            value={String(l.tax_rate ?? gstRate)}
                            onChange={e => updateLine(s.id, l.id, 'tax_rate', parseFloat(e.target.value))}
                            onKeyDown={e => focusNextLineControl(e, s.id)}
                          >
                            {taxOptions.map(t => <option key={t.id} value={String(t.rate)}>{t.name} ({Math.round(t.rate * 100)}%)</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700 text-sm whitespace-nowrap">
                          {formatCurrency(l.line_total)}
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => removeLine(s.id, l.id)} className="text-gray-300 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 flex gap-2 flex-wrap">
                  <Button variant="ghost" size="sm" onClick={() => addLine(s.id)}>
                    <Plus className="h-3.5 w-3.5" /> Add line
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => addLabour(s.id)}>
                    <Clock className="h-3.5 w-3.5" /> Add labour
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => addSundry(s.id)}>
                    <Plus className="h-3.5 w-3.5" /> Add sundry
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAddItemOpen({ sectionId: s.id, mode: 'items' })}>
                    <Package className="h-3.5 w-3.5" /> Price List Lookup
                  </Button>
                  {kits.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setAddItemOpen({ sectionId: s.id, mode: 'kits' })}>
                      <Package className="h-3.5 w-3.5" /> Add kit
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}

        <Button variant="outline" onClick={addSection} size="sm"><Plus className="h-4 w-4" /> Add section</Button>

        {/* Notes & terms */}
        <Card>
          <CardHeader className="font-semibold text-sm text-gray-900">Notes &amp; terms</CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Message to customer</Label>
              <Textarea value={meta.customer_message} onChange={e => updateMeta('customer_message', e.target.value)} rows={3} placeholder="Shown on the quote…" />
            </div>
            <div>
              <Label>Internal notes</Label>
              <Textarea value={meta.notes} onChange={e => updateMeta('notes', e.target.value)} rows={2} placeholder="Not shown to customer" />
            </div>
            <div>
              <Label>Terms &amp; conditions</Label>
              <Textarea value={meta.terms} onChange={e => updateMeta('terms', e.target.value)} rows={4} placeholder="Payment terms, warranty, cancellation policy…" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-72 space-y-4 shrink-0">
        <Card className="sticky top-20">
          <CardHeader className="font-semibold text-sm text-gray-900">{quoteNumber}</CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 text-sm">
              {pricesIncludeTax && <p className="text-xs text-gray-400 -mt-1 mb-1">Unit prices include GST</p>}
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">Discount</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" step="any" value={docDiscountValue || ''} placeholder="0"
                      onChange={e => { const v = parseFloat(e.target.value) || 0; setDocDiscountValue(v); if (v > 0 && !docDiscountType) setDocDiscountType('amount') }}
                      className="w-20 h-7 border border-gray-200 rounded-lg px-2 text-sm text-right focus:outline-none focus:border-orange-400"
                    />
                    <button type="button" onClick={() => setDocDiscountType(docDiscountType === 'percent' ? 'amount' : 'percent')} className="h-7 px-1.5 text-xs font-semibold text-gray-500 bg-gray-100 rounded hover:bg-gray-200" title="Toggle $ / %">
                      {docDiscountType === 'percent' ? '%' : '$'}
                    </button>
                  </div>
                </div>
                {docDiscountAmount > 0 && <div className="flex justify-between text-green-600 text-xs mt-0.5"><span>Applied</span><span>−{formatCurrency(docDiscountAmount)}</span></div>}
              </div>
              <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(gstAmount)}</span></div>
              <div className="flex justify-between font-semibold text-gray-900 text-base border-t border-gray-100 pt-2 mt-2">
                <span>Total</span><span>{formatCurrency(total)}</span>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <Button className="w-full" loading={saving} onClick={() => save('draft')}>Save draft</Button>
              <Button variant="outline" className="w-full" loading={saving} onClick={() => save('sent')}>Save &amp; send</Button>
              {autosaveStatus === 'saving' && <p className="text-center text-xs text-gray-400">Saving draft…</p>}
              {autosaveStatus === 'saved' && <p className="text-center text-xs text-gray-400">Draft auto-saved</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Price list dialog */}
      <Dialog open={!!addItemOpen} onClose={() => { setAddItemOpen(null); setPriceSearch('') }} title={addItemOpen?.mode === 'kits' ? 'Add kit' : 'Add from price list'} className="max-w-2xl">
        <div className="space-y-4">
          <input
            autoFocus
            value={priceSearch}
            onChange={e => setPriceSearch(e.target.value)}
            placeholder={addItemOpen?.mode === 'kits' ? 'Search kits…' : 'Search items…'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
          />
          {addItemOpen?.mode === 'kits' && (
            <div>
              <div className="grid grid-cols-2 gap-2">
                {kits.filter(k => !priceSearch || k.name.toLowerCase().includes(priceSearch.toLowerCase()) || (k.code ?? '').toLowerCase().includes(priceSearch.toLowerCase())).map(k => (
                  <button key={k.id} onClick={() => addFromKit(addItemOpen.sectionId, k as KitWithItems)}
                    className="text-left p-3 rounded-lg border border-gray-200 hover:border-[var(--accent,#f97316)]/40 hover:bg-orange-50 transition-colors">
                    <p className="text-sm font-medium text-gray-800">{k.name}</p>
                    <p className="text-xs text-gray-400">{k.code ? `${k.code} · ` : ''}{formatCurrency(Number(k.sell_price ?? 0))} · {k.kit_items.length} items</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {addItemOpen?.mode !== 'kits' && <div>
            {!priceSearch && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Items</p>}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {priceItems.filter(i => !priceSearch || i.name.toLowerCase().includes(priceSearch.toLowerCase())).map(item => (
                <button key={item.id} onClick={() => { addFromPriceList(addItemOpen!.sectionId, item); setPriceSearch('') }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{item.type} · {item.unit}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{formatCurrency(priceForCustomerGroup(item, selectedCustomer))}</span>
                </button>
              ))}
            </div>
          </div>}
        </div>
      </Dialog>
    </div>
  )
}
