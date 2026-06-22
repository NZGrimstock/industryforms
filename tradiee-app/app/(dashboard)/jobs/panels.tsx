'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import { Plus, Trash2, FileStack, BellRing, ChevronRight } from 'lucide-react'

type Template = { id: string; name: string; title: string | null; description: string | null; tags: string | null }
type Reminder = { id: string; title: string; due_date: string; interval: string | null; status: string; customers: { name: string } | null }

// ── Job Templates ────────────────────────────────────────────────────────────
export function JobTemplatesPanel({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [rows, setRows] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', title: '', description: '', tags: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('job_templates').select('*').eq('company_id', companyId).order('name')
    setRows((data ?? []) as Template[])
    setLoading(false)
  }, [supabase, companyId])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { toast('Enter a template name', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('job_templates').insert({
      company_id: companyId, name: form.name.trim(), title: form.title || null,
      description: form.description || null, tags: form.tags || null,
    })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setOpen(false); setForm({ name: '', title: '', description: '', tags: '' }); load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return
    await supabase.from('job_templates').delete().eq('id', id)
    load()
  }

  // Prefill the new-job dialog from a template via query params.
  function use(t: Template) {
    const p = new URLSearchParams({ view: 'list', newJob: '1' })
    if (t.title) p.set('title', t.title)
    if (t.description) p.set('description', t.description)
    router.push(`/jobs?${p.toString()}`)
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New template</Button>
      </div>
      {loading ? null : rows.length === 0 ? (
        <EmptyState icon={FileStack} title="No job templates" description="Save common jobs as templates to create them in one click" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 font-medium text-gray-500">Template</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Default title</th>
              <th className="px-6 py-3 w-32"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-6 py-3 text-gray-600">{t.title ?? '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => use(t)} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent,#f97316)] hover:underline mr-3">Use <ChevronRight className="h-3 w-3" /></button>
                    <button onClick={() => remove(t.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="New job template">
        <form onSubmit={create} className="space-y-4">
          <div><Label>Template name <span className="text-red-400">*</span></Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Annual heat-pump service" required /></div>
          <div><Label>Default job title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Default description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          <div className="flex gap-3"><Button type="submit" loading={saving}>Save template</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </>
  )
}

// ── Service Reminders ────────────────────────────────────────────────────────
export function ServiceRemindersPanel({ companyId, customers }: { companyId: string; customers: { id: string; name: string }[] }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [rows, setRows] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ customerId: '', title: '', due_date: '', interval: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('service_reminders').select('*, customers(name)').eq('company_id', companyId).order('due_date')
    setRows((data ?? []) as unknown as Reminder[])
    setLoading(false)
  }, [supabase, companyId])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.due_date) { toast('Title and due date are required', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('service_reminders').insert({
      company_id: companyId, customer_id: form.customerId || null, title: form.title.trim(),
      due_date: form.due_date, interval: form.interval || null,
    })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setOpen(false); setForm({ customerId: '', title: '', due_date: '', interval: '' }); load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this reminder?')) return
    await supabase.from('service_reminders').delete().eq('id', id)
    load()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New service reminder</Button>
      </div>
      {loading ? null : rows.length === 0 ? (
        <EmptyState icon={BellRing} title="No service reminders" description="Schedule reminders for recurring servicing (e.g. annual maintenance)" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-3 font-medium text-gray-500">Reminder</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Due</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Repeat</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="px-6 py-3 w-12"></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{r.title}</td>
                  <td className="px-6 py-3 text-gray-600">{r.customers?.name ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{formatDate(r.due_date)}</td>
                  <td className="px-6 py-3 text-gray-500 capitalize">{r.interval ?? 'One-off'}</td>
                  <td className="px-6 py-3"><span className="text-xs capitalize text-gray-500">{r.status}</span></td>
                  <td className="px-6 py-3 text-right"><button onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="New service reminder">
        <form onSubmit={create} className="space-y-4">
          <div><Label>Title <span className="text-red-400">*</span></Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual gas safety check" required /></div>
          <div><Label>Customer</Label><Select value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))} placeholder="Optional…" options={customers.map(c => ({ value: c.id, label: c.name }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Due date <span className="text-red-400">*</span></Label><Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required /></div>
            <div><Label>Repeat</Label><Select value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))} options={[{ value: '', label: 'One-off' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' }]} /></div>
          </div>
          <div className="flex gap-3"><Button type="submit" loading={saving}>Save reminder</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </>
  )
}
