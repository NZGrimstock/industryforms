'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'

type Supplier = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  account_number: string | null
  notes: string | null
}

export function SupplierForm({ companyId, supplier }: { companyId: string; supplier?: Supplier }) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    account_number: supplier?.account_number ?? '',
    notes: supplier?.notes ?? '',
  })
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      company_id: companyId,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      account_number: form.account_number || null,
      notes: form.notes || null,
    }
    const { error } = supplier
      ? await supabase.from('suppliers').update(payload).eq('id', supplier.id)
      : await supabase.from('suppliers').insert(payload)
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    toast(supplier ? 'Supplier updated' : 'Supplier added')
    router.push('/suppliers')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Name <span className="text-red-400">*</span></Label>
        <Input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. PlumbWorld Supplies" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
      </div>
      <div><Label>Address</Label><Input value={form.address} onChange={e => set('address', e.target.value)} /></div>
      <div><Label>Account number</Label><Input value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="Your trade account #" /></div>
      <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} /></div>
      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>{supplier ? 'Save changes' : 'Add supplier'}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
