'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, X, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Profile = { id: string; full_name: string }
type Customer = { id: string; name: string }

interface Enquiry {
  id: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  description: string | null
  status: string
  assigned_to: string | null
  notes: string | null
  follow_up_at: string | null
}

interface Props {
  enquiry: Enquiry
  companyId: string
  profileId: string
  team: Profile[]
  customers: Customer[]
  nextQuoteNumber: string
  nextJobNumber: string
}

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost']

export function EnquiryDetailClient({ enquiry, companyId, profileId, team, customers, nextQuoteNumber, nextJobNumber }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState(enquiry.notes ?? '')
  const [convertOpen, setConvertOpen] = useState(false)
  const [convertTo, setConvertTo] = useState<'quote' | 'job'>('quote')
  const [customerId, setCustomerId] = useState('')
  const [newCustomerName, setNewCustomerName] = useState(enquiry.customer_name)
  const [useExistingCustomer, setUseExistingCustomer] = useState(false)
  const [dupCustomer, setDupCustomer] = useState<{ id: string; name: string } | null>(null)
  const [forceCreate, setForceCreate] = useState(false)
  const [aiQuoteBusy, setAiQuoteBusy] = useState(false)

  async function findDuplicate(name: string) {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId)
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle()
    return data
  }

  async function checkNewCustomer() {
    if (useExistingCustomer || !newCustomerName.trim()) { setDupCustomer(null); return }
    setDupCustomer(await findDuplicate(newCustomerName))
  }

  async function updateStatus(status: string) {
    setLoading(true)
    await supabase.from('enquiries').update({ status }).eq('id', enquiry.id)
    setLoading(false)
    router.refresh()
  }

  async function saveNotes() {
    setLoading(true)
    await supabase.from('enquiries').update({ notes }).eq('id', enquiry.id)
    setLoading(false)
    setNotesOpen(false)
    router.refresh()
  }

  // Single quote-creation path used by both the plain "Convert to quote" button
  // and the "Convert with AI line items" path. When useAi=true we ask the
  // AI-draft-quote endpoint for a title + summary + line items, then insert them.
  async function createQuote(targetCustomerId: string, useAi: boolean) {
    let aiResult: { title: string; summary: string; lines: Array<{ priceListItemId?: string | null; description: string; quantity: number; unit: string; unitPrice: number; type: string }> } | null = null
    if (useAi) {
      const res = await fetch('/api/ai/draft-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: enquiry.description ?? enquiry.customer_name }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'AI draft failed'); setLoading(false); setAiQuoteBusy(false); return }
      aiResult = json
    }
    const { data: q } = await supabase.from('quotes').insert({
      company_id: companyId,
      customer_id: targetCustomerId,
      title: (aiResult?.title || enquiry.description?.slice(0, 100)) ?? 'Enquiry quote',
      quote_number: nextQuoteNumber,
      status: 'draft',
      customer_message: aiResult?.summary ?? null,
    }).select('id').single()
    if (!q) { setLoading(false); setAiQuoteBusy(false); return }
    if (aiResult?.lines?.length) {
      let subtotal = 0
      const rows = aiResult.lines.map((l, i) => {
        const lineTotal = l.quantity * l.unitPrice
        subtotal += lineTotal
        return {
          quote_id: q.id,
          price_list_item_id: l.priceListItemId ?? null,
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_price: l.unitPrice,
          line_total: lineTotal,
          sort_order: i,
        }
      })
      await supabase.from('quote_line_items').insert(rows)
      await supabase.from('quotes').update({ subtotal, total: subtotal }).eq('id', q.id)
    }
    await supabase.from('enquiries').update({ status: 'quoted', converted_to_quote_id: q.id }).eq('id', enquiry.id)
    setConvertOpen(false)
    setLoading(false)
    setAiQuoteBusy(false)
    router.push(`/quotes/${q.id}`)
  }

  async function aiDraftFromEnquiry() {
    if (!enquiry.description?.trim()) { alert('Add a work description on the enquiry first.'); return }
    setAiQuoteBusy(true)
    // Resolve / create the customer using the same flow as the regular convert
    let targetCustomerId = customerId
    if (!useExistingCustomer) {
      if (!forceCreate) {
        const existing = await findDuplicate(newCustomerName)
        if (existing) { setDupCustomer(existing); setAiQuoteBusy(false); return }
      }
      const { data: newCust } = await supabase.from('customers').insert({
        company_id: companyId, name: newCustomerName,
        email: enquiry.customer_email, phone: enquiry.customer_phone,
      }).select('id').single()
      targetCustomerId = newCust?.id ?? ''
    }
    if (!targetCustomerId) { setAiQuoteBusy(false); return }
    setLoading(true)
    setConvertTo('quote')
    await createQuote(targetCustomerId, true)
  }

  async function convertEnquiry() {
    let targetCustomerId = customerId

    // Create customer if not using existing
    if (!useExistingCustomer) {
      // Gate on duplicate unless the user explicitly chose to create anyway
      if (!forceCreate) {
        const existing = await findDuplicate(newCustomerName)
        if (existing) { setDupCustomer(existing); return }
      }
      setLoading(true)
      const { data: newCust } = await supabase.from('customers').insert({
        company_id: companyId,
        name: newCustomerName,
        email: enquiry.customer_email,
        phone: enquiry.customer_phone,
      }).select('id').single()
      targetCustomerId = newCust?.id ?? ''
    } else {
      setLoading(true)
    }

    if (!targetCustomerId) { setLoading(false); return }

    if (convertTo === 'quote') {
      await createQuote(targetCustomerId, false)
      return
    } else {
      const { data: j } = await supabase.from('jobs').insert({
        company_id: companyId,
        customer_id: targetCustomerId,
        title: enquiry.description?.slice(0, 100) ?? 'Enquiry job',
        job_number: nextJobNumber,
        status: 'unscheduled',
        description: enquiry.description,
      }).select('id').single()
      if (j) {
        await supabase.from('enquiries').update({ status: 'won', converted_to_job_id: j.id }).eq('id', enquiry.id)
        setConvertOpen(false)
        setLoading(false)
        router.push(`/jobs/${j.id}`)
        return
      }
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-orange-400 cursor-pointer capitalize"
          value={enquiry.status}
          onChange={e => updateStatus(e.target.value)}
          disabled={loading}
        >
          {STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
      </div>

      <button
        onClick={() => setNotesOpen(true)}
        className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
      >
        Add note
      </button>

      <button
        onClick={() => setConvertOpen(true)}
        className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg font-medium"
      >
        Convert
      </button>

      {/* Notes dialog */}
      {notesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Add / edit notes</CardTitle>
                <button onClick={() => setNotesOpen(false)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                rows={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes about this enquiry…"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setNotesOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={saveNotes} disabled={loading} className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg disabled:opacity-50">Save</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Convert dialog */}
      {convertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Convert enquiry</CardTitle>
                <button onClick={() => setConvertOpen(false)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Convert to</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConvertTo('quote')}
                    className={`flex-1 py-2 text-sm rounded-lg border font-medium ${convertTo === 'quote' ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Quote ({nextQuoteNumber})
                  </button>
                  <button
                    onClick={() => setConvertTo('job')}
                    className={`flex-1 py-2 text-sm rounded-lg border font-medium ${convertTo === 'job' ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Job ({nextJobNumber})
                  </button>
                </div>
                {convertTo === 'quote' && enquiry.description && (
                  <button
                    type="button"
                    disabled={aiQuoteBusy}
                    onClick={aiDraftFromEnquiry}
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 py-2 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 rounded-lg"
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiQuoteBusy ? 'Drafting with AI…' : 'Draft quote with AI from this enquiry'}
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Customer</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setUseExistingCustomer(false); setForceCreate(false) }}
                    className={`flex-1 py-1.5 text-xs rounded-lg border ${!useExistingCustomer ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    Create new
                  </button>
                  <button
                    onClick={() => { setUseExistingCustomer(true); setDupCustomer(null) }}
                    className={`flex-1 py-1.5 text-xs rounded-lg border ${useExistingCustomer ? 'border-[var(--accent,#f97316)] bg-orange-50 text-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    Use existing
                  </button>
                </div>
                {useExistingCustomer ? (
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400"
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                  >
                    <option value="">Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                      value={newCustomerName}
                      onChange={e => { setNewCustomerName(e.target.value); setForceCreate(false) }}
                      onBlur={checkNewCustomer}
                      placeholder="Customer name"
                    />
                    {dupCustomer && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                        <p className="text-amber-800 mb-2">
                          A customer named <strong>{dupCustomer.name}</strong> already exists. Use the existing record?
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => { setUseExistingCustomer(true); setCustomerId(dupCustomer.id); setDupCustomer(null) }}
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white font-medium"
                          >
                            Use existing
                          </button>
                          <button
                            onClick={() => { setForceCreate(true); setDupCustomer(null) }}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                          >
                            Create anyway
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setConvertOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button
                  onClick={convertEnquiry}
                  disabled={loading || (useExistingCustomer ? !customerId : !newCustomerName.trim())}
                  className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Converting…' : `Convert to ${convertTo}`}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
