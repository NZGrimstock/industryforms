'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { geocodeAddress } from '@/lib/geocode'
import { Customer } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { VoiceInput } from '@/components/ui/voice-input'
import { SmartWriteButton } from '@/components/ui/smart-write'
import { Dialog } from '@/components/ui/dialog'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

interface Props {
  companyId: string
  customer?: Customer
  pricingGroups?: { id: string; name: string }[]
  onSuccess?: () => void
}

export function CustomerForm({ companyId, customer, pricingGroups = [], onSuccess }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const [form, setForm] = useState({
    type: customer?.type ?? 'residential',
    name: customer?.name ?? '',
    contact_person: customer?.contact_person ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    billing_address: customer?.billing_address ?? '',
    pricing_group_id: customer?.pricing_group_id ?? '',
    notes: customer?.notes ?? '',
  })
  const [addAsJobSite, setAddAsJobSite] = useState(true)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function doSave() {
    if (!form.email.trim() || !form.phone.trim() || !form.billing_address.trim()) {
      toast('Email, phone, and billing address are required', 'error')
      setLoading(false)
      return
    }
    const payload = {
      ...form,
      company_id: companyId,
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      billing_address: form.billing_address || null,
      pricing_group_id: form.pricing_group_id || null,
      notes: form.notes || null,
    }

    let customerId = customer?.id ?? ''
    if (customer) {
      const { error } = await supabase.from('customers').update(payload).eq('id', customer.id)
      if (error) { toast(error.message, 'error'); setLoading(false); return }
    } else {
      const { data, error } = await supabase.from('customers').insert(payload).select('id').single()
      if (error) { toast(error.message, 'error'); setLoading(false); return }
      customerId = data!.id
    }

    if (addAsJobSite && form.billing_address.trim()) {
      const coords = (await geocodeAddress(form.billing_address)) ?? { lat: null, lng: null }
      await supabase.from('customer_sites').insert({
        customer_id: customerId,
        address: form.billing_address.trim(),
        label: customer ? 'Billing address' : null,
        lat: coords.lat,
        lng: coords.lng,
      })
    }

    toast(customer ? 'Customer updated' : 'Customer created')
    if (onSuccess) onSuccess()
    else router.push('/customers')
    setLoading(false)
  }

  async function checkDuplicate() {
    if (customer || !form.name.trim()) return
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId)
      .ilike('name', form.name.trim())
      .limit(1)
      .maybeSingle()
    if (data) setDuplicate(data)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (!customer) {
      const { data: existing } = await supabase
        .from('customers')
        .select('id, name')
        .eq('company_id', companyId)
        .ilike('name', form.name.trim())
        .limit(1)
        .maybeSingle()
      if (existing) {
        setDuplicate(existing)
        setLoading(false)
        return
      }
    }

    await doSave()
  }

  function applyVoice(data: Record<string, string>) {
    if (data.type && ['residential', 'commercial'].includes(data.type)) set('type', data.type)
    if (data.name) set('name', data.name)
    if (data.contact_person) set('contact_person', data.contact_person)
    if (data.email) set('email', data.email)
    if (data.phone) set('phone', data.phone)
    if (data.billing_address) set('billing_address', data.billing_address)
    if (data.notes) set('notes', data.notes)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Fill fields automatically</span>
          <VoiceInput mode="customer" onParsed={applyVoice} />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={form.type} onChange={e => set('type', e.target.value)}
            options={[{ value: 'residential', label: 'Residential' }, { value: 'commercial', label: 'Commercial' }]} />
        </div>
        <div>
          <Label>Name <span className="text-red-400">*</span></Label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} onBlur={checkDuplicate} required />
        </div>
        <div>
          <Label>Contact person</Label>
          <Input value={form.contact_person} onChange={e => set('contact_person', e.target.value)} placeholder="If commercial" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Email <span className="text-red-400">*</span></Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div>
            <Label>Phone <span className="text-red-400">*</span></Label>
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} required />
          </div>
        </div>
        {pricingGroups.length > 0 && (
          <div>
            <Label>Pricing level</Label>
            <Select
              value={form.pricing_group_id}
              onChange={e => set('pricing_group_id', e.target.value)}
              options={[
                { value: '', label: 'Standard pricing' },
                ...pricingGroups.map(group => ({ value: group.id, label: group.name })),
              ]}
            />
          </div>
        )}
        <div>
          <Label>Billing address <span className="text-red-400">*</span></Label>
          <AddressAutocomplete value={form.billing_address} onChange={v => set('billing_address', v)} placeholder="Start typing an address…" required />
          {form.billing_address.trim() && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input type="checkbox" checked={addAsJobSite} onChange={e => setAddAsJobSite(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-600">Add as job site</span>
            </label>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Notes</Label>
            <SmartWriteButton value={form.notes} onChange={v => set('notes', v)} />
          </div>
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>{customer ? 'Save changes' : 'Create customer'}</Button>
          <Button type="button" variant="outline" onClick={() => onSuccess ? onSuccess() : router.back()}>Cancel</Button>
        </div>
      </form>

      <Dialog open={!!duplicate} onClose={() => setDuplicate(null)} title="Customer already exists">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A customer named <strong>{duplicate?.name}</strong> already exists. Would you like to use the existing record instead?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => router.push(`/customers/${duplicate?.id}`)}>
              Use existing customer
            </Button>
            <Button variant="outline" onClick={() => { setDuplicate(null); setLoading(true); doSave() }}>
              Create anyway
            </Button>
            <Button variant="ghost" onClick={() => setDuplicate(null)}>Cancel</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
