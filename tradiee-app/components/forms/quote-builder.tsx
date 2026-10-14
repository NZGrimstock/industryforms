'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PriceListItem, Kit, Customer, CustomerSite, QuoteSection, QuoteLineItem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { cn, formatCurrency, formatDate, quoteLabel } from '@/lib/utils'
import { lineNet, computeTaxedTotals, type DiscountType } from '@/lib/pricing'
import { priceForCustomerGroup } from '@/lib/customer-pricing'
import { Plus, Trash2, Package, Clock, Eye, Pencil } from 'lucide-react'
import {
  DocumentWorkspace, Paper, PaperHeader, PaperFields, PaperColumns, PaperBlock, PaperLines, PaperLinesHead,
  PaperSectionHeading, PaperEditRow, PaperTotals, PaperSignatures, PaperFootnote, PaperLegend,
  InternalRail, RailCard, RailRow, PAPER_INPUT, PAPER_LINE_GRID, PAPER_GHOST_BUTTON, type PaperCompany,
} from '@/components/documents/paper'

// Number inputs on the paper: no spinner arrows, right-aligned like print.
const PAPER_NUM = cn(PAPER_INPUT, 'text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')
const RAIL_INPUT = 'w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30'
const RAIL_LABEL = 'mb-1 block text-xs font-semibold text-gray-600'

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
  is_estimate: boolean
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
  isFreePlan?: boolean
  templateData?: {
    title?: string
    terms?: string
    sections: Array<{ title: string; is_optional?: boolean; lines: Array<{ description?: string; quantity?: number; unit?: string; unit_cost?: number; unit_price?: number; type?: string; discount_type?: string | null; discount_value?: number | null; tax_rate?: number | null }> }>
  }
  editQuote?: EditQuoteData
  /** Header of the paper — the same company block the printed quote shows. */
  company: PaperCompany
  /** When the quote row was created (editing); new quotes show today. */
  createdAt?: string | null
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
  onFocusLine,
  readOnly,
}: {
  value: string
  placeholder: string
  priceItems: PriceListItem[]
  onTextChange: (value: string) => void
  onPick: (item: PriceListItem) => void
  onEnter: () => void
  onFocusLine?: () => void
  readOnly?: boolean
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
      <input
        value={value}
        readOnly={readOnly}
        aria-label="Description"
        onFocus={() => { if (!readOnly) setOpen(true); onFocusLine?.() }}
        onChange={e => { onTextChange(e.target.value); setOpen(true) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
        className={PAPER_INPUT}
        placeholder={placeholder}
      />
      {open && !readOnly && matches.length > 0 && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white font-sans shadow-lg">
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
function CustomerCombobox({ customers, value, onChange, companyId, onCreated, inputClassName }: {
  customers: (Customer & { customer_sites: CustomerSite[] })[]
  value: string
  onChange: (id: string) => void
  companyId: string
  onCreated: (c: Customer & { customer_sites: CustomerSite[] }) => void
  inputClassName?: string
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
        aria-label="Customer"
        className={inputClassName ?? 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400'}
        placeholder="Start typing customer name…"
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && !creating && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto font-sans">
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
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2 font-sans">
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

export function QuoteBuilder({ companyId, profileId, quoteNumber, gstRate, customers, priceItems, kits, defaultCustomerId, defaultTerms, billingRates = [], taxRates = [], pricesIncludeTax = false, isFreePlan = false, templateData, editQuote, company, createdAt }: Props) {
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
  // Line whose hidden details (cost, discount, tax…) show in the side rail.
  const [selected, setSelected] = useState<{ sectionId: string; lineId: string } | null>(null)
  // "Customer view": the paper exactly as it prints — no edit controls.
  const [preview, setPreview] = useState(false)
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
  const [isEstimate, setIsEstimate] = useState(!!editQuote?.is_estimate)

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
    const row = e.currentTarget.closest('[data-line-row]')
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
    setSelected(sel => (sel?.lineId === lineId ? null : sel))
  }

  function addSection() {
    const s = emptySection()
    setSections(ss => [...ss, s])
  }

  function updateSection(id: string, k: keyof DraftSection, v: unknown) {
    setSections(ss => ss.map(s => s.id !== id ? s : { ...s, [k]: v }))
  }

  function removeSection(id: string) {
    if (sections.length === 1) return
    setSections(ss => ss.filter(s => s.id !== id))
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
      if (!silent) toast(!meta.customerId ? 'Select a customer first' : `Enter a ${quoteLabel(isEstimate).toLowerCase()} title`, 'error')
      return
    }
    if (silent) setAutosaveStatus('saving'); else setSaving(true)

    const quotePayload = {
      customer_id: meta.customerId, site_id: meta.siteId || null,
      title: meta.title, status, is_estimate: isEstimate, subtotal, gst_amount: gstAmount, total,
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
    toast(`${quoteLabel(isEstimate)} ${savedId ? 'updated' : 'saved'}`)
    router.push(`/quotes/${quoteId}`)
  }, [meta, sections, subtotal, gstAmount, total, docDiscountType, docDiscountValue, docDiscountAmount, isEstimate, companyId, profileId, quoteNumber, supabase, toast, router, savedId, gstRate])

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


  // ── Paper view ─────────────────────────────────────────────────────────────
  const docWord = quoteLabel(isEstimate)
  const ro = preview
  const selectedSection = selected ? sections.find(s => s.id === selected.sectionId) : undefined
  const selectedLine = selectedSection?.lines.find(l => l.id === selected?.lineId)
  // Same gross-profit basis as the quote detail page: sell subtotal minus the
  // cost of every line.
  const totalCost = sections.flatMap(s => s.lines).reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost ?? 0), 0)
  const grossProfit = subtotal - totalCost
  const margin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0
  const preTax = subtotal - docDiscountAmount
  // Lines are numbered straight through all sections, like the printed quote.
  const lineNumbers = new Map<string, number>()
  sections.flatMap(s => s.lines).forEach((l, i) => lineNumbers.set(l.id, i + 1))
  const selectedNo = selectedLine ? lineNumbers.get(selectedLine.id) ?? 0 : 0

  function selectLine(sectionId: string, lineId: string) {
    if (!ro) setSelected({ sectionId, lineId })
  }

  const totalsRows = [
    { label: 'Total before discount', value: formatCurrency(subtotal) },
    ...(docDiscountAmount > 0
      ? [{ label: 'Total discount', value: `-${formatCurrency(docDiscountAmount)}` }, { label: 'Total before tax', value: formatCurrency(preTax) }]
      : []),
    { label: 'Total tax', value: formatCurrency(gstAmount) },
  ]

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">
            {editQuote ? 'Editing' : 'New'} {docWord.toLowerCase()} <b className="font-semibold text-gray-900">{quoteNumber}</b>
          </span>
          <span className="text-xs text-gray-500" aria-live="polite">
            {autosaveStatus === 'saving' ? 'Saving draft…' : autosaveStatus === 'saved' ? 'Draft auto-saved' : ''}
          </span>
          <span className="flex-1" />
          <Button variant={preview ? 'secondary' : 'outline'} size="sm" onClick={() => { setPreview(p => !p); setSelected(null) }}>
            {preview ? <><Pencil className="h-4 w-4" /> Back to editing</> : <><Eye className="h-4 w-4" /> Customer view</>}
          </Button>
          <Button variant="outline" size="sm" loading={saving} onClick={() => save('draft')}>Save draft</Button>
          <Button size="sm" loading={saving} onClick={() => save('sent')}>Save &amp; send</Button>
        </div>
        <PaperLegend />

        <DocumentWorkspace>
          <Paper label={`${docWord} document`}>
            <PaperHeader company={company} docLabel={docWord} docNumber={quoteNumber} />

            <PaperFields
              fields={[
                { label: `Date of ${docWord.toLowerCase()}`, value: formatDate(createdAt ?? new Date()) },
                { label: `${docWord} No.`, value: quoteNumber },
                {
                  label: 'Valid until',
                  value: (
                    <>
                      <input
                        type="date"
                        aria-label="Valid until"
                        readOnly={ro}
                        value={meta.expires_at}
                        onChange={e => updateMeta('expires_at', e.target.value)}
                        className={cn(PAPER_INPUT, 'py-0 font-bold')}
                      />
                      {!ro && (
                        <span className="mt-1 flex gap-1 font-sans text-[11px] font-medium">
                          {[7, 30, 90].map(d => (
                            <button key={d} type="button" onClick={() => setExpiry(d)} className="rounded bg-white px-1.5 py-0.5 text-gray-600 hover:bg-orange-50 hover:text-orange-800">{d}d</button>
                          ))}
                        </span>
                      )}
                    </>
                  ),
                },
              ]}
            />

            <PaperColumns>
              <PaperBlock title="Client">
                {ro ? (
                  <div className="px-1">{selectedCustomer?.name ?? '—'}</div>
                ) : (
                  <CustomerCombobox
                    customers={customerList}
                    value={meta.customerId}
                    onChange={id => { updateMeta('customerId', id); updateMeta('siteId', '') }}
                    companyId={companyId}
                    onCreated={c => { setCustomerList(prev => [...prev, c]); updateMeta('customerId', c.id); updateMeta('siteId', '') }}
                    inputClassName={PAPER_INPUT}
                  />
                )}
                {selectedCustomer?.billing_address ? <div className="whitespace-pre-wrap px-1">{selectedCustomer.billing_address}</div> : null}
                {selectedCustomer?.email ? <div className="px-1">{selectedCustomer.email}</div> : null}
              </PaperBlock>
              <PaperBlock title="Reference">
                <input
                  aria-label="Reference"
                  readOnly={ro}
                  value={meta.reference}
                  onChange={e => updateMeta('reference', e.target.value)}
                  placeholder={ro ? '' : 'Customer PO / your ref'}
                  className={PAPER_INPUT}
                />
              </PaperBlock>
            </PaperColumns>

            <input
              aria-label={`${docWord} title`}
              readOnly={ro}
              value={meta.title}
              onChange={e => updateMeta('title', e.target.value)}
              placeholder={`${docWord} title, e.g. Electrical work at 12 Main St`}
              className={cn(PAPER_INPUT, 'mb-3 text-base font-bold')}
            />

            <PaperLines>
              <PaperLinesHead />
              {sections.map(s => (
                <div key={s.id}>
                  <PaperSectionHeading
                    optional={s.is_optional}
                    controls={!ro && (
                      <span className="flex items-center gap-3 font-sans">
                        {!isFreePlan && (
                          <label className="flex min-h-8 cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                            <input type="checkbox" checked={s.is_optional} onChange={e => updateSection(s.id, 'is_optional', e.target.checked)} className="rounded" />
                            Optional
                          </label>
                        )}
                        {sections.length > 1 && (
                          <button type="button" aria-label={`Remove section ${s.title}`} onClick={() => removeSection(s.id)} className="rounded p-1 text-gray-400 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </span>
                    )}
                  >
                    <input
                      aria-label="Section title"
                      readOnly={ro}
                      value={s.title}
                      onChange={e => updateSection(s.id, 'title', e.target.value)}
                      className={cn(PAPER_INPUT, 'font-bold')}
                    />
                  </PaperSectionHeading>

                  {s.lines.map(l => {
                    const isSel = !ro && selected?.lineId === l.id
                    return (
                      <div
                        key={l.id}
                        data-line-row
                        data-line-id={l.id}
                        className={cn(PAPER_LINE_GRID, 'border-b border-gray-100 px-2 py-0.5', isSel && 'bg-orange-50 shadow-[inset_3px_0_0_#f97316]')}
                      >
                        <span className="text-xs text-gray-500">{lineNumbers.get(l.id)}</span>
                        {l.type === 'labour' ? (
                          <input
                            aria-label="Description"
                            readOnly={ro}
                            value={l.description}
                            onFocus={() => selectLine(s.id, l.id)}
                            onChange={e => updateLine(s.id, l.id, 'description', e.target.value)}
                            onKeyDown={e => focusNextLineControl(e, s.id)}
                            className={PAPER_INPUT}
                            placeholder="Labour description…"
                          />
                        ) : (
                          <LineDescriptionInput
                            value={l.description}
                            placeholder="Description…"
                            priceItems={priceItems}
                            readOnly={ro}
                            onFocusLine={() => selectLine(s.id, l.id)}
                            onTextChange={value => updateLine(s.id, l.id, 'description', value)}
                            onPick={item => updateLineFromPriceList(s.id, l.id, item)}
                            onEnter={() => {
                              const row = document.querySelector(`[data-line-id="${l.id}"]`)
                              row?.querySelectorAll<HTMLInputElement>('input')[1]?.focus()
                            }}
                          />
                        )}
                        <span className="flex gap-0.5">
                          <input
                            type="number" min="0" step="any" aria-label="Quantity" readOnly={ro}
                            value={l.quantity}
                            onFocus={() => selectLine(s.id, l.id)}
                            onChange={e => updateLine(s.id, l.id, 'quantity', parseFloat(e.target.value) || 0)}
                            onKeyDown={e => focusNextLineControl(e, s.id)}
                            className={cn(PAPER_NUM, 'w-[55%]')}
                          />
                          <input
                            aria-label="Unit" readOnly={ro}
                            value={l.unit}
                            onFocus={() => selectLine(s.id, l.id)}
                            onChange={e => updateLine(s.id, l.id, 'unit', e.target.value)}
                            onKeyDown={e => focusNextLineControl(e, s.id)}
                            className={cn(PAPER_INPUT, 'w-[45%]')}
                          />
                        </span>
                        <span className="flex items-center">
                          <span className="text-gray-500">$</span>
                          <input
                            type="number" step="0.01" aria-label="Unit price" readOnly={ro}
                            value={l.unit_price}
                            onFocus={() => selectLine(s.id, l.id)}
                            onChange={e => updateLine(s.id, l.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            onKeyDown={e => focusNextLineControl(e, s.id)}
                            className={PAPER_NUM}
                          />
                        </span>
                        <span className="whitespace-nowrap pr-1 text-right">{formatCurrency(l.line_total)}</span>
                      </div>
                    )
                  })}

                  {!ro && (
                    <PaperEditRow>
                      <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => addLine(s.id)}><Plus className="h-3.5 w-3.5" /> Line</button>
                      <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => addLabour(s.id)}><Clock className="h-3.5 w-3.5" /> Labour</button>
                      <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => addSundry(s.id)}><Plus className="h-3.5 w-3.5" /> Sundry</button>
                      <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => setAddItemOpen({ sectionId: s.id, mode: 'items' })}><Package className="h-3.5 w-3.5" /> Price list</button>
                      {kits.length > 0 && (
                        <button type="button" className={PAPER_GHOST_BUTTON} onClick={() => setAddItemOpen({ sectionId: s.id, mode: 'kits' })}><Package className="h-3.5 w-3.5" /> Kit</button>
                      )}
                    </PaperEditRow>
                  )}
                </div>
              ))}
              {!ro && (
                <button
                  type="button"
                  onClick={addSection}
                  className="mt-3 min-h-10 w-full rounded-md border border-dashed border-gray-300 bg-gray-50 font-sans text-[13px] text-gray-600 hover:bg-orange-50 hover:text-orange-800"
                >
                  + Add section
                </button>
              )}
            </PaperLines>

            <PaperTotals rows={totalsRows} grand={{ label: 'Total', value: formatCurrency(total) }} />

            <PaperSignatures left="Customer signature" right="Authorised signature" />

            <div className="mt-7 grid grid-cols-1 gap-7 sm:grid-cols-2">
              {(!ro || meta.customer_message) && (
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[.05em] text-gray-600">Message</div>
                  <textarea
                    aria-label="Message to customer" readOnly={ro} rows={5}
                    value={meta.customer_message}
                    onChange={e => updateMeta('customer_message', e.target.value)}
                    placeholder="Shown on the quote…"
                    className={cn(PAPER_INPUT, 'block resize-y text-xs leading-[1.55] text-gray-700')}
                  />
                </div>
              )}
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[.05em] text-gray-600">Terms &amp; conditions</div>
                <textarea
                  aria-label="Terms and conditions" readOnly={ro} rows={5}
                  value={meta.terms}
                  onChange={e => updateMeta('terms', e.target.value)}
                  placeholder={`This ${docWord.toLowerCase()} is valid until the date shown above. Prices may change after this date.`}
                  className={cn(PAPER_INPUT, 'block resize-y text-xs leading-[1.55] text-gray-700')}
                />
              </div>
            </div>
            <PaperFootnote show={isFreePlan} />
          </Paper>

          <InternalRail label={`Internal — not on the ${docWord.toLowerCase()}`}>
            <RailCard title={`Profit on this ${docWord.toLowerCase()}`}>
              <div className={cn('text-[26px] font-bold', grossProfit < 0 ? 'text-red-600' : 'text-gray-900')}>{subtotal > 0 ? `${margin.toFixed(0)}%` : '—'}</div>
              <p className="mb-2 text-[13px] text-gray-600">gross margin</p>
              <RailRow label="Sell (ex GST)" value={formatCurrency(subtotal)} />
              <RailRow label="Your cost" value={formatCurrency(totalCost)} />
              <RailRow label="Gross profit" value={formatCurrency(grossProfit)} />
              {pricesIncludeTax && <p className="mt-2 text-xs text-gray-500">Unit prices are entered including GST.</p>}
            </RailCard>

            {selectedLine && selectedSection ? (
              <RailCard tone="accent" title={`Line ${selectedNo} — hidden details`}>
                <div className="space-y-2.5">
                  <div>
                    <label htmlFor="ql-type" className={RAIL_LABEL}>Type</label>
                    <select id="ql-type" className={RAIL_INPUT} value={selectedLine.type} onChange={e => updateLine(selectedSection.id, selectedLine.id, 'type', e.target.value)}>
                      <option value="material">Material</option>
                      <option value="labour">Labour</option>
                      <option value="misc">Sundry / misc</option>
                    </select>
                  </div>
                  {selectedLine.type === 'labour' && billingRates.length > 0 && (
                    <div>
                      <label htmlFor="ql-rate" className={RAIL_LABEL}>Billing rate</label>
                      <select
                        id="ql-rate" className={RAIL_INPUT} value=""
                        onChange={e => { const r = billingRates.find(b => b.id === e.target.value); if (r) updateLine(selectedSection.id, selectedLine.id, 'unit_price', r.rate) }}
                      >
                        <option value="">Apply a rate…</option>
                        {billingRates.map(r => <option key={r.id} value={r.id}>{r.name} (${Number(r.rate).toFixed(0)})</option>)}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="ql-cost" className={RAIL_LABEL}>Unit cost ($)</label>
                      <input
                        id="ql-cost" type="number" step="0.01" className={RAIL_INPUT}
                        value={selectedLine.unit_cost ?? 0}
                        onChange={e => updateLine(selectedSection.id, selectedLine.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label htmlFor="ql-disc" className={RAIL_LABEL}>Discount</label>
                      <div className="flex gap-1">
                        <input
                          id="ql-disc" type="number" min="0" step="any" placeholder="0" className={RAIL_INPUT}
                          value={selectedLine.discount_value || ''}
                          onChange={e => updateLine(selectedSection.id, selectedLine.id, 'discount_value', parseFloat(e.target.value) || 0)}
                        />
                        <button
                          type="button"
                          title="Toggle $ / %"
                          aria-label={`Discount is in ${selectedLine.discount_type === 'percent' ? 'percent' : 'dollars'} — switch`}
                          onClick={() => updateLine(selectedSection.id, selectedLine.id, 'discount_type', selectedLine.discount_type === 'percent' ? 'amount' : 'percent')}
                          className="min-w-9 rounded-md border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          {selectedLine.discount_type === 'percent' ? '%' : '$'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ql-tax" className={RAIL_LABEL}>Tax</label>
                    <select
                      id="ql-tax" className={RAIL_INPUT}
                      value={String(selectedLine.tax_rate ?? gstRate)}
                      onChange={e => updateLine(selectedSection.id, selectedLine.id, 'tax_rate', parseFloat(e.target.value))}
                    >
                      {taxOptions.map(t => <option key={t.id} value={String(t.rate)}>{t.name} ({Math.round(t.rate * 100)}%)</option>)}
                    </select>
                  </div>
                  <RailRow
                    label="Line margin"
                    value={Number(selectedLine.line_total) > 0
                      ? `${(((Number(selectedLine.line_total) - Number(selectedLine.quantity) * Number(selectedLine.unit_cost ?? 0)) / Number(selectedLine.line_total)) * 100).toFixed(0)}%`
                      : '—'}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => removeLine(selectedSection.id, selectedLine.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" /> Remove line
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>Done</Button>
                  </div>
                </div>
              </RailCard>
            ) : (
              !ro && (
                <RailCard>
                  <p className="text-[13px] leading-normal text-gray-600">Click a line on the {docWord.toLowerCase()} to set its cost, discount and tax. Those never print.</p>
                </RailCard>
              )
            )}

            <RailCard title="Job site">
              <label htmlFor="q-site" className="sr-only">Job site</label>
              <select
                id="q-site"
                className={RAIL_INPUT}
                value={meta.siteId}
                onChange={e => updateMeta('siteId', e.target.value)}
                disabled={!selectedCustomer || ro}
              >
                <option value="">{selectedCustomer ? 'No specific site' : 'Select a customer first'}</option>
                {(selectedCustomer?.customer_sites ?? []).map(site => (
                  <option key={site.id} value={site.id}>{site.label ? `${site.label} — ${site.address}` : site.address}</option>
                ))}
              </select>
            </RailCard>

            <RailCard title="Options">
              <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={isEstimate} disabled={ro} onChange={e => setIsEstimate(e.target.checked)} className="mt-0.5 rounded" />
                This is an estimate, not a fixed quote
              </label>
              <label htmlFor="q-docdisc" className={RAIL_LABEL}>Discount on the whole {docWord.toLowerCase()}</label>
              <div className="flex gap-1">
                <input
                  id="q-docdisc" type="number" min="0" step="any" placeholder="0" disabled={ro} className={RAIL_INPUT}
                  value={docDiscountValue || ''}
                  onChange={e => { const v = parseFloat(e.target.value) || 0; setDocDiscountValue(v); if (v > 0 && !docDiscountType) setDocDiscountType('amount') }}
                />
                <button
                  type="button" disabled={ro}
                  title="Toggle $ / %"
                  aria-label={`Discount is in ${docDiscountType === 'percent' ? 'percent' : 'dollars'} — switch`}
                  onClick={() => setDocDiscountType(docDiscountType === 'percent' ? 'amount' : 'percent')}
                  className="min-w-9 rounded-md border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  {docDiscountType === 'percent' ? '%' : '$'}
                </button>
              </div>
            </RailCard>

            <RailCard>
              <label htmlFor="q-notes" className="mb-2.5 block text-sm font-semibold text-gray-900">Internal notes</label>
              <textarea
                id="q-notes" rows={4} readOnly={ro}
                value={meta.notes}
                onChange={e => updateMeta('notes', e.target.value)}
                placeholder="Not shown to the customer"
                className={cn(RAIL_INPUT, 'resize-y leading-normal')}
              />
            </RailCard>
          </InternalRail>
        </DocumentWorkspace>
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
