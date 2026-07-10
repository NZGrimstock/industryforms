'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AIRewriteButton } from '@/components/ui/ai-rewrite-button'

type Profile = { id: string; full_name: string }

interface Props {
  companyId: string
  profileId: string
  team: Profile[]
  mode: 'new'
  initialOpen?: boolean
}

const SOURCES = ['website', 'phone', 'email', 'referral', 'walk_in', 'other']

export function EnquiryActions({ companyId, profileId, team, mode, initialOpen = false }: Props) {
  const [open, setOpen] = useState(initialOpen)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    address: '',
    description: '',
    source: 'other',
    assigned_to: '',
    follow_up_at: '',
  })
  const [dupCustomer, setDupCustomer] = useState<{ id: string; name: string } | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Kept as separate first/last inputs but joined into the single
  // `customer_name` column everything else reads.
  function updateName(first: string, last: string) {
    setFirstName(first)
    setLastName(last)
    setForm(f => ({ ...f, customer_name: `${first} ${last}`.trim() }))
  }

  async function checkDuplicate() {
    if (!form.customer_name.trim()) { setDupCustomer(null); return }
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId)
      .ilike('name', form.customer_name.trim())
      .limit(1)
      .maybeSingle()
    setDupCustomer(data)
  }

  async function save() {
    if (!form.customer_name.trim()) return
    setLoading(true)
    const { error } = await supabase.from('enquiries').insert({
      company_id: companyId,
      customer_name: form.customer_name,
      customer_email: form.customer_email || null,
      customer_phone: form.customer_phone || null,
      address: form.address || null,
      description: form.description || null,
      source: form.source,
      assigned_to: form.assigned_to || null,
      follow_up_at: form.follow_up_at || null,
    })
    setLoading(false)
    if (!error) {
      setOpen(false)
      setForm({ customer_name: '', customer_email: '', customer_phone: '', address: '', description: '', source: 'other', assigned_to: '', follow_up_at: '' })
      setFirstName('')
      setLastName('')
      setDupCustomer(null)
      router.refresh()
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        <Plus className="h-4 w-4" /> New enquiry
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>New enquiry</CardTitle>
                <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">First name *</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    value={firstName}
                    onChange={e => { updateName(e.target.value, lastName); setDupCustomer(null) }}
                    onBlur={checkDuplicate}
                    placeholder="John"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Last name</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    value={lastName}
                    onChange={e => { updateName(firstName, e.target.value); setDupCustomer(null) }}
                    onBlur={checkDuplicate}
                    placeholder="Smith"
                  />
                </div>
              </div>
              {dupCustomer && (
                <p className="-mt-2 text-xs text-amber-700">
                  Matches existing customer{' '}
                  <a href={`/customers/${dupCustomer.id}`} target="_blank" className="font-medium underline hover:text-amber-800">
                    {dupCustomer.name}
                  </a>
                  {' '}— this enquiry won&apos;t create a duplicate; link it when you convert.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address / site</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Work description</label>
                  <AIRewriteButton value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />
                </div>
                <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                    {SOURCES.map(s => <option key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assign to</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 bg-white" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {team.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Follow-up date</label>
                <input type="datetime-local" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.follow_up_at} onChange={e => setForm(f => ({ ...f, follow_up_at: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={save} disabled={loading || !form.customer_name.trim()} className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-50 text-white rounded-lg">
                  {loading ? 'Saving…' : 'Save enquiry'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
