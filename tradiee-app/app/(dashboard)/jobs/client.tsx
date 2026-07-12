'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { useToast } from '@/components/ui/toast'
import { VoiceInput } from '@/components/ui/voice-input'
import { SmartWriteButton } from '@/components/ui/smart-write'
import { Plus, Trash2, ChevronRight, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { geocodeAddress } from '@/lib/geocode'
import { priceForCustomerGroup } from '@/lib/customer-pricing'

type Site = { id: string; label: string | null; address: string }

interface PriceItem { id: string; name: string; unit: string; sell_price: number; cost_price: number; customer_group_prices?: { customer_group_id: string; sell_price: number }[] | null }

interface QuickLine {
  description: string
  quantity: string
  unit: string
  unit_cost: string
  sell_price: string
  price_list_item_id: string | null
  type: 'material' | 'labour'
}

interface Props {
  companyId: string
  customers: { id: string; name: string; pricing_group_id?: string | null }[]
  teamMembers?: { id: string; full_name: string | null; email: string }[]
  defaultJobAssigneeId?: string | null
  nextJobNumber: string
  priceItems?: PriceItem[]
  standardMarkupEnabled?: boolean
  standardMarkupPct?: number
  initialOpen?: boolean
  initialTitle?: string
  initialDescription?: string
  initialCustomerId?: string
}

const emptyLine = (): QuickLine => ({
  description: '', quantity: '1', unit: 'each', unit_cost: '', sell_price: '', price_list_item_id: null, type: 'material',
})

export function NewJobButton({ companyId, customers, teamMembers = [], defaultJobAssigneeId = null, nextJobNumber, priceItems = [], standardMarkupEnabled = false, standardMarkupPct = 80, initialOpen = false, initialTitle = '', initialDescription = '', initialCustomerId = '' }: Props) {
  const initialAssigneeId = teamMembers.some(member => member.id === defaultJobAssigneeId)
    ? defaultJobAssigneeId!
    : teamMembers.length === 1
      ? teamMembers[0].id
      : ''
  const [open, setOpen] = useState(initialOpen)
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lines, setLines] = useState<QuickLine[]>([emptyLine()])
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({})
  const [showBulkItems, setShowBulkItems] = useState(false)
  const [bulkSearch, setBulkSearch] = useState('')
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([])
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState({ customerId: initialCustomerId, title: initialTitle, description: initialDescription, status: 'unscheduled', reference: '', siteId: '', assigneeId: initialAssigneeId })
  const selectedCustomer = customers.find(customer => customer.id === form.customerId)
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing')
  const [newCust, setNewCust] = useState({ name: '', phone: '', addAsSite: false, siteAddress: '' })
  const [sites, setSites] = useState<Site[]>([])
  const [showAddSite, setShowAddSite] = useState(false)
  const [newSite, setNewSite] = useState({ label: '', address: '' })
  const [addingSite, setAddingSite] = useState(false)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!form.customerId) { setSites([]); return }
    supabase.from('customer_sites').select('id, label, address')
      .eq('customer_id', form.customerId).order('created_at')
      .then(({ data }) => {
        setSites((data ?? []) as Site[])
        set('siteId', data?.[0]?.id ?? '')
      })
  }, [form.customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addSiteInline() {
    if (!newSite.address.trim() || !form.customerId) return
    setAddingSite(true)
    const coords = await geocodeAddress(newSite.address.trim())
    const { data, error } = await supabase.from('customer_sites').insert({
      customer_id: form.customerId,
      label: newSite.label.trim() || null,
      address: newSite.address.trim(),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    }).select('id, label, address').single()
    setAddingSite(false)
    if (error) { toast(error.message, 'error'); return }
    setSites(prev => [...prev, data as Site])
    set('siteId', (data as Site).id)
    setShowAddSite(false)
    setNewSite({ label: '', address: '' })
  }

  function applyVoice(data: Record<string, string>) {
    if (data.title) set('title', data.title)
    if (data.description) set('description', data.description)
    if (data.status && ['unscheduled', 'scheduled', 'in_progress'].includes(data.status)) set('status', data.status)
  }

  function reset() {
    setForm({ customerId: '', title: '', description: '', status: 'unscheduled', reference: '', siteId: '', assigneeId: initialAssigneeId })
    setCustomerMode('existing')
    setNewCust({ name: '', phone: '', addAsSite: false, siteAddress: '' })
    setSites([])
    setShowAddSite(false)
    setNewSite({ label: '', address: '' })
    setLines([emptyLine()])
    setSearchTerms({})
    setShowBulkItems(false)
    setBulkSearch('')
    setBulkSelectedIds([])
    setStep(1)
    setCreatedJobId(null)
  }

  function close() { setOpen(false); setTimeout(reset, 300) }

  function updateLine(i: number, field: keyof QuickLine, value: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function pickPriceItem(i: number, item: PriceItem) {
    const groupPrice = priceForCustomerGroup(item, selectedCustomer)
    const sellPrice = groupPrice || (standardMarkupEnabled ? Number((item.cost_price * (1 + standardMarkupPct / 100)).toFixed(2)) : item.cost_price)
    setLines(prev => prev.map((l, idx) => idx === i ? {
      ...l,
      description: item.name,
      unit: item.unit,
      unit_cost: item.cost_price.toString(),
      sell_price: sellPrice.toString(),
      price_list_item_id: item.id,
    } : l))
    setSearchTerms(prev => ({ ...prev, [i]: '' }))
  }

  function addLine(type: 'material' | 'labour') {
    setLines(prev => [...prev, { ...emptyLine(), type, unit: type === 'labour' ? 'hr' : 'each' }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function toggleBulkItem(id: string) {
    setBulkSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function addSelectedPriceItems() {
    const selected = priceItems.filter(item => bulkSelectedIds.includes(item.id))
    if (selected.length === 0) return
    setLines(prev => [
      ...prev.filter(l => l.description.trim()),
      ...selected.map(item => {
        const groupPrice = priceForCustomerGroup(item, selectedCustomer)
        const sellPrice = groupPrice || (standardMarkupEnabled ? Number((item.cost_price * (1 + standardMarkupPct / 100)).toFixed(2)) : item.cost_price)
        return {
          description: item.name,
          quantity: '1',
          unit: item.unit,
          unit_cost: item.cost_price.toString(),
          sell_price: sellPrice.toString(),
          price_list_item_id: item.id,
          type: 'material' as const,
        }
      }),
    ])
    setBulkSelectedIds([])
    setBulkSearch('')
    setShowBulkItems(false)
  }

  // Autosaves step 1 as a draft job while the user is still filling it in, so
  // closing the dialog or navigating away doesn't lose the work. Scoped to the
  // "existing customer" path only — the "new customer" path creates a customer
  // record as a side effect, which isn't safe to repeat on every debounce tick.
  async function autosaveJobDraft() {
    if (customerMode !== 'existing' || !form.customerId || !form.title.trim()) return
    setAutosaveStatus('saving')
    const payload = {
      customer_id: form.customerId,
      title: form.title,
      description: form.description || null,
      status: form.status,
      reference: form.reference || null,
      site_id: form.siteId || null,
      assigned_to: form.assigneeId || null,
    }
    if (createdJobId) {
      const { error } = await supabase.from('jobs').update(payload).eq('id', createdJobId)
      setAutosaveStatus(error ? 'idle' : 'saved')
      return
    }
    const { data: job, error } = await supabase.from('jobs').insert({
      ...payload,
      company_id: companyId,
      job_number: nextJobNumber,
    }).select('id').single()
    if (error || !job) { setAutosaveStatus('idle'); return }
    setCreatedJobId(job.id)
    setAutosaveStatus('saved')
  }

  useEffect(() => {
    if (!open || step !== 1) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => { autosaveJobDraft() }, 1500)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, form.title, form.description, form.status, form.reference, form.siteId, form.customerId, form.assigneeId, customerMode])

  // Step 1: create job record
  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // Autosave already created this draft (existing-customer path) — just push
    // the latest edits and move on instead of inserting a second job row.
    if (createdJobId && customerMode === 'existing') {
      const { error } = await supabase.from('jobs').update({
        customer_id: form.customerId,
        title: form.title,
        description: form.description || null,
        status: form.status,
        reference: form.reference || null,
        site_id: form.siteId || null,
        assigned_to: form.assigneeId || null,
      }).eq('id', createdJobId)
      setLoading(false)
      if (error) { toast(error.message, 'error'); return }
      setStep(2)
      return
    }

    // Resolve the customer — either an existing selection or a new one created inline.
    let customerId = form.customerId
    if (customerMode === 'new') {
      const name = newCust.name.trim()
      if (!name) { toast('Enter the customer name', 'error'); setLoading(false); return }
      // Reuse an existing customer with the same name to avoid duplicates.
      const { data: existing } = await supabase.from('customers')
        .select('id').eq('company_id', companyId).ilike('name', name).limit(1).maybeSingle()
      if (existing) {
        customerId = existing.id
        toast('Using existing customer with that name')
      } else {
        const { data: created, error: ce } = await supabase.from('customers')
          .insert({ company_id: companyId, name, phone: newCust.phone.trim() || null })
          .select('id').single()
        if (ce || !created) { toast(ce?.message ?? 'Failed to create customer', 'error'); setLoading(false); return }
        customerId = created.id
      }
    } else if (!customerId) {
      toast('Select a customer', 'error'); setLoading(false); return
    }

    // If creating a new customer with "Add as job site" checked, create the site too
    let siteId: string | null = form.siteId || null
    if (customerMode === 'new' && newCust.addAsSite && newCust.siteAddress.trim() && customerId) {
      const coords = await geocodeAddress(newCust.siteAddress.trim())
      const { data: site } = await supabase.from('customer_sites').insert({
        customer_id: customerId,
        address: newCust.siteAddress.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      }).select('id').single()
      if (site) siteId = site.id
    }

    const { data: job, error } = await supabase.from('jobs').insert({
      company_id: companyId,
      customer_id: customerId,
      job_number: nextJobNumber,
      title: form.title,
      description: form.description || null,
      status: form.status,
      reference: form.reference || null,
      site_id: siteId,
      assigned_to: form.assigneeId || null,
    }).select('id').single()
    setLoading(false)
    if (error) { toast(error.message, 'error'); return }
    setCreatedJobId(job.id)
    setStep(2)
  }

  // Step 2: save lines then navigate
  async function handleSaveLines(skip = false) {
    if (!createdJobId) return
    if (!skip) {
      const validLines = lines.filter(l => l.description.trim())
      if (validLines.length > 0) {
        setLoading(true)
        const rows = validLines.map(l => ({
          job_id: createdJobId,
          company_id: companyId,
          description: l.description.trim(),
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit,
          unit_cost: parseFloat(l.unit_cost) || 0,
          unit_price: parseFloat(l.sell_price) || parseFloat(l.unit_cost) || 0,
          price_list_item_id: l.price_list_item_id,
        }))
        const { error } = await supabase.from('job_materials').insert(rows)
        setLoading(false)
        if (error) { toast(error.message, 'error'); return }
      }
    }
    close()
    router.push(`/jobs/${createdJobId}`)
    router.refresh()
  }

  const lineTotal = lines.reduce((s, l) => {
    const qty = parseFloat(l.quantity) || 0
    const price = parseFloat(l.sell_price) || parseFloat(l.unit_cost) || 0
    return s + qty * price
  }, 0)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New job</Button>

      <Dialog open={open} onClose={close} title={step === 1 ? 'New job' : `Add items — ${form.title}`}>
        {step === 1 && (
          <form onSubmit={handleCreateJob} className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Fill fields automatically</span>
              <VoiceInput mode="job" onParsed={applyVoice} />
            </div>
            <div>
              <Label>Customer <span className="text-red-400">*</span></Label>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setCustomerMode('existing')}
                  className={`flex-1 py-1.5 text-xs rounded-lg border ${customerMode === 'existing' ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  Existing
                </button>
                <button type="button" onClick={() => setCustomerMode('new')}
                  className={`flex-1 py-1.5 text-xs rounded-lg border ${customerMode === 'new' ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  + New customer
                </button>
              </div>
              {customerMode === 'existing' ? (
                <Select value={form.customerId} onChange={e => { set('customerId', e.target.value); set('siteId', '') }}
                  placeholder="Select customer..." options={customers.map(c => ({ value: c.id, label: c.name }))} />
              ) : (
                <div className="space-y-2">
                  <Input value={newCust.name} onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))} placeholder="Customer name *" />
                  <Input value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} placeholder="Phone (optional)" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newCust.addAsSite} onChange={e => setNewCust(c => ({ ...c, addAsSite: e.target.checked }))} className="rounded" />
                    <span className="text-sm text-gray-600">Add as job site</span>
                  </label>
                  {newCust.addAsSite && (
                    <AddressAutocomplete value={newCust.siteAddress} onChange={v => setNewCust(c => ({ ...c, siteAddress: v }))} placeholder="Site address *" />
                  )}
                </div>
              )}
            </div>
            {/* Job site — only shown for existing customers */}
            {customerMode === 'existing' && form.customerId && (
              <div>
                <Label>Job site <span className="text-red-400">*</span></Label>
                {showAddSite ? (
                  <div className="space-y-2 border border-orange-200 rounded-xl p-3 bg-orange-50/40">
                    <Input value={newSite.label} onChange={e => setNewSite(s => ({ ...s, label: e.target.value }))} placeholder="Label (e.g. Main house)" />
                    <AddressAutocomplete value={newSite.address} onChange={v => setNewSite(s => ({ ...s, address: v }))} placeholder="Full address *" />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" loading={addingSite} onClick={addSiteInline} disabled={!newSite.address.trim()}>Add site</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setShowAddSite(false); setNewSite({ label: '', address: '' }) }}>Cancel</Button>
                    </div>
                  </div>
                ) : sites.length === 0 ? (
                  <div className="text-sm text-gray-400 py-2">
                    No sites for this customer. <button type="button" className="text-[var(--accent,#f97316)] underline" onClick={() => setShowAddSite(true)}>Add job site</button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Select value={form.siteId} onChange={e => set('siteId', e.target.value)} options={[
                        ...sites.map(s => ({ value: s.id, label: s.label ? `${s.label} — ${s.address}` : s.address })),
                      ]} placeholder="Select site..." required />
                    </div>
                    <button type="button" onClick={() => setShowAddSite(true)} className="mt-1 text-xs text-[var(--accent,#f97316)] hover:underline whitespace-nowrap">+ Add site</button>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Title <span className="text-red-400">*</span></Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="e.g. Install heat pump" />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="Customer PO / your ref" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Description</Label>
                <SmartWriteButton value={form.description} onChange={v => set('description', v)} />
              </div>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Optional internal notes" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={e => set('status', e.target.value)} options={[
                { value: 'unscheduled', label: 'Unscheduled' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'in_progress', label: 'In progress' },
              ]} />
            </div>
            {teamMembers.length > 1 && (
              <div>
                <Label>Assign job to</Label>
                <Select value={form.assigneeId} onChange={e => set('assigneeId', e.target.value)} options={[
                  { value: '', label: 'Unassigned' },
                  ...teamMembers.map(member => ({ value: member.id, label: member.full_name || member.email })),
                ]} />
              </div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" loading={loading}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              {autosaveStatus === 'saving' && <span className="text-xs text-gray-400">Saving draft…</span>}
              {autosaveStatus === 'saved' && <span className="text-xs text-gray-400">Draft auto-saved</span>}
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Add materials and labour upfront, or skip and add them later on the job page.</p>

            {/* Lines table */}
            <div className="space-y-2">
              {lines.map((line, i) => {
                const search = searchTerms[i] ?? ''
                const suggestions = search.length > 1
                  ? priceItems.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
                  : []
                const total = (parseFloat(line.quantity) || 0) * (parseFloat(line.sell_price) || parseFloat(line.unit_cost) || 0)

                return (
                  <div key={i} className={`border rounded-xl p-3 ${line.type === 'labour' ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100 bg-gray-50/50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${line.type === 'labour' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                        {line.type === 'labour' ? 'Labour' : 'Material'}
                      </span>
                      {total > 0 && <span className="text-xs text-gray-400 ml-auto">{formatCurrency(total)}</span>}
                      <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-400 ml-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Description with price list search */}
                    <div className="relative mb-2">
                      <Input
                        value={line.description || search}
                        onChange={e => {
                          updateLine(i, 'description', e.target.value)
                          setSearchTerms(prev => ({ ...prev, [i]: e.target.value }))
                        }}
                        placeholder={line.type === 'labour' ? 'Labour description (e.g. Installation)' : 'Item description or search price list…'}
                        className="text-sm"
                      />
                      {suggestions.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                          {suggestions.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pickPriceItem(i, s)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center justify-between"
                            >
                              <span className="text-gray-800">{s.name}</span>
                              <span className="text-xs text-gray-400">{formatCurrency(priceForCustomerGroup(s, selectedCustomer))}/{s.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Qty</p>
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={e => updateLine(i, 'quantity', e.target.value)}
                          step="0.01"
                          min="0"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Unit</p>
                        <Input
                          value={line.unit}
                          onChange={e => updateLine(i, 'unit', e.target.value)}
                          placeholder={line.type === 'labour' ? 'hr' : 'each'}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Cost</p>
                        <Input
                          type="number"
                          value={line.unit_cost}
                          onChange={e => updateLine(i, 'unit_cost', e.target.value)}
                          step="0.01"
                          placeholder="0.00"
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Sell</p>
                        <Input
                          type="number"
                          value={line.sell_price}
                          onChange={e => updateLine(i, 'sell_price', e.target.value)}
                          step="0.01"
                          placeholder="0.00"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add line buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addLine('material')}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Material
              </button>
              {priceItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkItems(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
                >
                  <Package className="h-3.5 w-3.5" /> Pick items
                </button>
              )}
              <button
                type="button"
                onClick={() => addLine('labour')}
                className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 rounded-lg px-3 py-1.5 hover:border-blue-400 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Labour
              </button>
            </div>

            {showBulkItems && (
              <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                <Input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)} placeholder="Search price list..." className="mb-2" />
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {priceItems
                    .filter(item => !bulkSearch || item.name.toLowerCase().includes(bulkSearch.toLowerCase()))
                    .map(item => {
                      const selected = bulkSelectedIds.includes(item.id)
                      const groupPrice = priceForCustomerGroup(item, selectedCustomer)
                      const sellPrice = groupPrice || (standardMarkupEnabled ? Number((item.cost_price * (1 + standardMarkupPct / 100)).toFixed(2)) : item.cost_price)
                      return (
                        <button key={item.id} type="button" onClick={() => toggleBulkItem(item.id)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between text-sm ${selected ? 'bg-orange-50 text-orange-700' : 'hover:bg-white text-gray-700'}`}>
                          <span>{selected ? '✓ ' : ''}{item.name}</span>
                          <span className="text-xs text-gray-500">{formatCurrency(sellPrice)}/{item.unit}</span>
                        </button>
                      )
                    })}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button type="button" size="sm" onClick={addSelectedPriceItems} disabled={bulkSelectedIds.length === 0}>Add selected ({bulkSelectedIds.length})</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setShowBulkItems(false); setBulkSelectedIds([]) }}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Totals */}
            {lineTotal > 0 && (
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-sm">
                <span className="text-gray-500">Estimated total (sell)</span>
                <span className="font-semibold text-gray-900">{formatCurrency(lineTotal)}</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button loading={loading} onClick={() => handleSaveLines(false)}>
                Save &amp; open job
              </Button>
              <Button variant="outline" onClick={() => handleSaveLines(true)}>Skip</Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}
