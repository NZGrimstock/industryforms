'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { geocodeAddress } from '@/lib/geocode'

interface Props {
  customerId: string
  onSuccess?: () => void
}

export function SiteForm({ customerId, onSuccess }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ label: '', address: '', access_notes: '' })

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // Geocode once, here, and store the result — the map then reads lat/lng directly
    // instead of geocoding every load.
    const coords = await geocodeAddress(form.address)
    const { error } = await supabase.from('customer_sites').insert({
      customer_id: customerId,
      label: form.label || null,
      address: form.address,
      access_notes: form.access_notes || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })
    if (error) toast(error.message, 'error')
    else { toast(coords ? 'Site added' : 'Site added (address couldn’t be mapped)'); onSuccess?.() }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Label (optional)</Label>
        <Input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Main house, Rental" />
      </div>
      <div>
        <Label>Address <span className="text-red-400">*</span></Label>
        <Input value={form.address} onChange={e => set('address', e.target.value)} required />
      </div>
      <div>
        <Label>Access notes</Label>
        <Textarea value={form.access_notes} onChange={e => set('access_notes', e.target.value)} placeholder="Gate code, dog, parking..." rows={2} />
      </div>
      <Button type="submit" loading={loading}>Add site</Button>
    </form>
  )
}
