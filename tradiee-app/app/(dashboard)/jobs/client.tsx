'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { VoiceInput } from '@/components/ui/voice-input'
import { SmartWriteButton } from '@/components/ui/smart-write'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface PriceItem { id: string; name: string; unit: string; sell_price: number; cost_price: number }

interface QuickLine {
  description: string
  quantity: string
  unit: string
  unit_cost: string
  sell_price: string
  price_item_id: string | null
  type: 'material' | 'labour'
}

interface Props {
  companyId: string
  customers: { id: string; name: string }[]
  nextJobNumber: string
  priceItems?: PriceItem[]
  initialOpen?: boolean
  initialTitle?: string
  initialDescription?: string
  initialCustomerId?: string
}

const emptyLine = (): QuickLine => ({
  description: '', quantity: '1', unit: 'each', unit_cost: '', sell_price: '', price_item_id: null, type: 'material',
})

export function NewJobButton({ companyId, customers, nextJobNumber, priceItems = [], initialOpen = false, initialTitle = '', initialDescription = '', initialCustomerId = '' }: Props) {
  const [open, setOpen] = useState(initialOpen)
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [lines, setLines] = useState<QuickLine[]>([emptyLine()])
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({})
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState({ customerId: initialCustomerId, title: initialTitle, description: initialDescription, status: 'unscheduled', reference: '' })
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing')
  const [newCust, setNewCust] = useState({ name: '', phone: '' })

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function applyVoice(data: Record<string, string>) {
    if (data.title) set('title', data.title)
    if (data.description) set('description', data.description)
    if (data.status && ['unscheduled', 'scheduled', 'in_progress'].includes(data.status)) set('status', data.status)
  }

  function reset() {
    setForm({ customerId: '', title: '', description: '', status: 'unscheduled', reference: '' })
    setCustomerMode('existing')
    setNewCust({ name: '', phone: '' })
    setLines([emptyLine()])
    setSearchTerms({})
    setStep(1)
    setCreatedJobId(null)
  }

  function close() { setOpen(false); setTimeout(reset, 300) }

  function updateLine(i: number, field: keyof QuickLine, value: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function pickPriceItem(i: number, item: PriceItem) {
    setLines(prev => prev.map((l, idx) => idx === i ? {
      ...l,
      description: item.name,
      unit: item.unit,
      unit_cost: item.cost_price.toString(),
      sell_price: item.sell_price.toString(),
      price_item_id: item.id,
    } : l))
    setSearchTerms(prev => ({ ...prev, [i]: '' }))
  }

  function addLine(type: 'material' | 'labour') {
    setLines(prev => [...prev, { ...emptyLine(), type, unit: type === 'labour' ? 'hr' : 'each' }])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  // Step 1: create job record
  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

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

    const { data: job, error } = await supabase.from('jobs').insert({
      company_id: companyId,
      customer_id: customerId,
      job_number: nextJobNumber,
      title: form.title,
      description: form.description || null,
      status: form.status,
      reference: form.reference || null,
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
          price_item_id: l.price_item_id,
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
                  className={`flex-1 py-1.5 text-xs rounded-lg border ${customerMode === 'existing' ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  Existing
                </button>
                <button type="button" onClick={() => setCustomerMode('new')}
                  className={`flex-1 py-1.5 text-xs rounded-lg border ${customerMode === 'new' ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  + New customer
                </button>
              </div>
              {customerMode === 'existing' ? (
                <Select value={form.customerId} onChange={e => set('customerId', e.target.value)}
                  placeholder="Select customer..." options={customers.map(c => ({ value: c.id, label: c.name }))} />
              ) : (
                <div className="space-y-2">
                  <Input value={newCust.name} onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))} placeholder="Customer name *" />
                  <Input value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} placeholder="Phone (optional)" />
                </div>
              )}
            </div>
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
            <div className="flex gap-3 pt-1">
              <Button type="submit" loading={loading}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
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
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${line.type === 'labour' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
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
                              <span className="text-xs text-gray-400">{formatCurrency(s.sell_price)}/{s.unit}</span>
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
              <button
                type="button"
                onClick={() => addLine('labour')}
                className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-200 rounded-lg px-3 py-1.5 hover:border-blue-400 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Labour
              </button>
            </div>

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
