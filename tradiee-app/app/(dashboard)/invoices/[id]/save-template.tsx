'use client'
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { LayoutTemplate } from 'lucide-react'

export function SaveInvoiceTemplateButton({ invoiceId, defaultName }: { invoiceId: string; defaultName: string }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/invoice-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', invoiceId, name }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast(data.error ?? 'Failed', 'error'); return }
    toast('Saved as invoice template')
    setOpen(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
        <LayoutTemplate className="h-3.5 w-3.5" /> Save as template
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Save invoice template">
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-gray-500">Saves this invoice&apos;s line items and terms as a reusable template without a customer.</p>
          <div><Label>Template name</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
          <div className="flex gap-3"><Button type="submit" loading={saving}>Save</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </>
  )
}
