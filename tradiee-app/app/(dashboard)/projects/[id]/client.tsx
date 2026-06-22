'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Pencil, Briefcase, Receipt, Phone, Mail, ChevronUp, ChevronDown,
  CheckCircle2, Circle, PlayCircle,
} from 'lucide-react'

type Stage  = { id: string; name: string; description: string | null; sort_order: number; status: 'pending' | 'in_progress' | 'done'; target_end_date: string | null }
type Job    = { id: string; job_number: string; title: string; status: string; project_stage_id: string | null }
type Invoice = { id: string; invoice_number: string; status: string; total: number; amount_paid: number; project_stage_id: string | null }
type Contact = { id: string; name: string; role: string | null; phone: string | null; email: string | null; is_primary: boolean }
type Sub     = { id: string; name: string; trade: string | null; phone: string | null; email: string | null; notes: string | null }
type Profile = { id: string; full_name: string }
type Customer = { id: string; name: string }
type Project = { id: string; name: string; status: string; project_manager_id: string | null; customer_id: string | null; total_budget: number | null; target_end_date: string | null; description: string | null }

const STAGE_ICON: Record<Stage['status'], React.ComponentType<{ className?: string }>> = {
  pending: Circle, in_progress: PlayCircle, done: CheckCircle2,
}
const STAGE_TINT: Record<Stage['status'], string> = {
  pending: 'text-gray-400', in_progress: 'text-sky-500', done: 'text-emerald-500',
}

interface Props {
  project: Project
  stages: Stage[]
  jobs: Job[]
  invoices: Invoice[]
  contacts: Contact[]
  subbies: Sub[]
  team: Profile[]
  customers: Customer[]
}

export function ProjectDetailClient({ project, stages: initialStages, jobs, invoices, contacts: initialContacts, subbies: initialSubs, team, customers }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [stages, setStages] = useState(initialStages)
  const [contacts, setContacts] = useState(initialContacts)
  const [subs, setSubs] = useState(initialSubs)
  const [stageDialog, setStageDialog] = useState<Stage | 'new' | null>(null)
  const [contactDialog, setContactDialog] = useState<Contact | 'new' | null>(null)
  const [subDialog, setSubDialog] = useState<Sub | 'new' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // ── Stage status cycle & ordering ─────────────────────────────────────────
  async function cycleStage(s: Stage) {
    const next: Stage['status'] = s.status === 'pending' ? 'in_progress' : s.status === 'in_progress' ? 'done' : 'pending'
    const completedAt = next === 'done' ? new Date().toISOString() : null
    const optimistic = stages.map(x => x.id === s.id ? { ...x, status: next } : x)
    setStages(optimistic)
    const { error } = await supabase.from('project_stages').update({ status: next, completed_at: completedAt }).eq('id', s.id)
    if (error) { toast(error.message, 'error'); setStages(stages); return }
    router.refresh()
  }
  async function moveStage(s: Stage, dir: -1 | 1) {
    const ordered = [...stages]
    const idx = ordered.findIndex(x => x.id === s.id)
    const j = idx + dir
    if (j < 0 || j >= ordered.length) return
    const a = ordered[idx], b = ordered[j]
    ordered[idx] = { ...b, sort_order: a.sort_order }
    ordered[j] = { ...a, sort_order: b.sort_order }
    setStages([...ordered].sort((x, y) => x.sort_order - y.sort_order))
    await Promise.all([
      supabase.from('project_stages').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('project_stages').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
  }
  async function deleteStage(s: Stage) {
    if (!confirm(`Delete stage "${s.name}"? Jobs and invoices linked to it will become unstaged.`)) return
    setStages(stages.filter(x => x.id !== s.id))
    const { error } = await supabase.from('project_stages').delete().eq('id', s.id)
    if (error) { toast(error.message, 'error'); router.refresh() }
  }

  // ── Link / unlink a job or invoice to a stage ─────────────────────────────
  async function relinkJob(jobId: string, stageId: string | null) {
    setBusy(true)
    await supabase.from('jobs').update({ project_stage_id: stageId }).eq('id', jobId)
    setBusy(false)
    router.refresh()
  }
  async function relinkInvoice(invoiceId: string, stageId: string | null) {
    setBusy(true)
    await supabase.from('invoices').update({ project_stage_id: stageId }).eq('id', invoiceId)
    setBusy(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit project</Button>
      </div>

      {/* Stages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Stages</CardTitle>
            <Button size="sm" onClick={() => setStageDialog('new')}><Plus className="h-4 w-4" /> Add stage</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {stages.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 py-6 text-center">No stages yet — add one to start tracking progress.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {stages.map(s => {
                const Icon = STAGE_ICON[s.status]
                const stageJobs = jobs.filter(j => j.project_stage_id === s.id)
                const stageInvoices = invoices.filter(i => i.project_stage_id === s.id)
                return (
                  <li key={s.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <button onClick={() => cycleStage(s)} title="Cycle status" className="mt-0.5">
                        <Icon className={`h-5 w-5 ${STAGE_TINT[s.status]} hover:scale-110 transition-transform`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${s.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{s.name}</span>
                          {s.target_end_date && <span className="text-[11px] text-gray-400">Target {formatDate(s.target_end_date)}</span>}
                        </div>
                        {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}

                        {(stageJobs.length > 0 || stageInvoices.length > 0) && (
                          <ul className="mt-2 space-y-1">
                            {stageJobs.map(j => (
                              <li key={j.id} className="flex items-center justify-between text-xs">
                                <Link href={`/jobs/${j.id}`} className="inline-flex items-center gap-1.5 text-gray-700 hover:text-sky-600">
                                  <Briefcase className="h-3.5 w-3.5 text-sky-500" />{j.job_number} — {j.title}
                                </Link>
                                <span className="text-[10px] text-gray-400">{j.status.replace(/_/g, ' ')}</span>
                              </li>
                            ))}
                            {stageInvoices.map(i => (
                              <li key={i.id} className="flex items-center justify-between text-xs">
                                <Link href={`/invoices/${i.id}`} className="inline-flex items-center gap-1.5 text-gray-700 hover:text-[var(--accent,#f97316)]">
                                  <Receipt className="h-3.5 w-3.5 text-orange-500" />{i.invoice_number}
                                </Link>
                                <span className="tabular-nums text-gray-600">{formatCurrency(Number(i.total))}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveStage(s, -1)} className="p-1 text-gray-300 hover:text-gray-600" title="Move up"><ChevronUp className="h-4 w-4" /></button>
                        <button onClick={() => moveStage(s, 1)}  className="p-1 text-gray-300 hover:text-gray-600" title="Move down"><ChevronDown className="h-4 w-4" /></button>
                        <button onClick={() => setStageDialog(s)} className="p-1 text-gray-400 hover:text-gray-700" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteStage(s)}    className="p-1 text-gray-400 hover:text-rose-600"  title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Contacts + Subbies — two-up on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Main contacts</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setContactDialog('new')}><Plus className="h-4 w-4" /> Add</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {contacts.length === 0 ? <p className="px-6 py-6 text-sm text-gray-400 text-center">No contacts yet.</p> : (
              <ul className="divide-y divide-gray-50">
                {contacts.map(c => (
                  <li key={c.id} className="px-6 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{c.name}{c.is_primary && <span className="ml-2 text-[10px] uppercase font-semibold tracking-wide text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Primary</span>}</p>
                      {c.role && <p className="text-xs text-gray-500">{c.role}</p>}
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                        {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-sky-600"><Phone className="h-3 w-3" />{c.phone}</a>}
                        {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-sky-600"><Mail className="h-3 w-3" />{c.email}</a>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setContactDialog(c)} className="p-1 text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={async () => { if (confirm('Remove this contact?')) { setContacts(contacts.filter(x => x.id !== c.id)); await supabase.from('project_contacts').delete().eq('id', c.id) } }} className="p-1 text-gray-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Subcontractors</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setSubDialog('new')}><Plus className="h-4 w-4" /> Add</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {subs.length === 0 ? <p className="px-6 py-6 text-sm text-gray-400 text-center">No subbies yet.</p> : (
              <ul className="divide-y divide-gray-50">
                {subs.map(s => (
                  <li key={s.id} className="px-6 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{s.name}{s.trade && <span className="ml-2 text-xs text-gray-500">· {s.trade}</span>}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                        {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-sky-600"><Phone className="h-3 w-3" />{s.phone}</a>}
                        {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:text-sky-600"><Mail className="h-3 w-3" />{s.email}</a>}
                      </div>
                      {s.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setSubDialog(s)} className="p-1 text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={async () => { if (confirm('Remove this subbie?')) { setSubs(subs.filter(x => x.id !== s.id)); await supabase.from('project_subcontractors').delete().eq('id', s.id) } }} className="p-1 text-gray-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stage relink (unstaged jobs/invoices live in the page; here we just expose a quick reassign for staged ones) */}
      {(jobs.length > 0 || invoices.length > 0) && (
        <Card>
          <CardHeader><CardTitle>Reassign jobs &amp; invoices to a stage</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-50">
              {jobs.map(j => (
                <li key={j.id} className="px-6 py-3 flex items-center justify-between gap-3">
                  <Link href={`/jobs/${j.id}`} className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-sky-600">
                    <Briefcase className="h-4 w-4 text-sky-500" />{j.job_number} — {j.title}
                  </Link>
                  <select disabled={busy} value={j.project_stage_id ?? ''} onChange={e => relinkJob(j.id, e.target.value || null)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                    <option value="">— Unstaged —</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </li>
              ))}
              {invoices.map(i => (
                <li key={i.id} className="px-6 py-3 flex items-center justify-between gap-3">
                  <Link href={`/invoices/${i.id}`} className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-[var(--accent,#f97316)]">
                    <Receipt className="h-4 w-4 text-orange-500" />{i.invoice_number} · {formatCurrency(Number(i.total))}
                  </Link>
                  <select disabled={busy} value={i.project_stage_id ?? ''} onChange={e => relinkInvoice(i.id, e.target.value || null)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                    <option value="">— Unstaged —</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Stage dialog ────────────────────────────────────────────────── */}
      <StageDialog
        value={stageDialog}
        projectId={project.id}
        nextOrder={stages.length}
        onClose={() => setStageDialog(null)}
        onSaved={(s, isNew) => {
          setStages(isNew ? [...stages, s].sort((a, b) => a.sort_order - b.sort_order) : stages.map(x => x.id === s.id ? s : x))
          setStageDialog(null); router.refresh()
        }}
      />

      <ContactDialog
        value={contactDialog} projectId={project.id}
        onClose={() => setContactDialog(null)}
        onSaved={(c, isNew) => { setContacts(isNew ? [...contacts, c] : contacts.map(x => x.id === c.id ? c : x)); setContactDialog(null) }}
      />
      <SubDialog
        value={subDialog} projectId={project.id}
        onClose={() => setSubDialog(null)}
        onSaved={(s, isNew) => { setSubs(isNew ? [...subs, s] : subs.map(x => x.id === s.id ? s : x)); setSubDialog(null) }}
      />

      {/* ── Edit project header ────────────────────────────────────────── */}
      <EditProjectDialog open={editOpen} project={project} customers={customers} team={team} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); router.refresh() }} />
    </>
  )
}

// ── Sub-dialogs ─────────────────────────────────────────────────────────────

function StageDialog({ value, projectId, nextOrder, onClose, onSaved }: { value: Stage | 'new' | null; projectId: string; nextOrder: number; onClose: () => void; onSaved: (s: Stage, isNew: boolean) => void }) {
  const supabase = createClient()
  const isNew = value === 'new'
  const initial = (isNew || !value) ? { name: '', description: '', status: 'pending' as Stage['status'], target_end_date: '' } : { name: value.name, description: value.description ?? '', status: value.status, target_end_date: value.target_end_date ?? '' }
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)

  if (!value) return null
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (isNew) {
      const { data, error } = await supabase.from('project_stages').insert({ project_id: projectId, sort_order: nextOrder, name: form.name, description: form.description || null, status: form.status, target_end_date: form.target_end_date || null }).select('*').single()
      setBusy(false)
      if (error || !data) return
      onSaved(data as Stage, true)
    } else {
      const id = (value as Stage).id
      const { data, error } = await supabase.from('project_stages').update({ name: form.name, description: form.description || null, status: form.status, target_end_date: form.target_end_date || null }).eq('id', id).select('*').single()
      setBusy(false)
      if (error || !data) return
      onSaved(data as Stage, false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={isNew ? 'Add stage' : 'Edit stage'}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Name <span className="text-red-400">*</span></Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
        <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Status</Label>
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Stage['status'] }))} options={[
              { value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' },
            ]} /></div>
          <div><Label>Target end date</Label><Input type="date" value={form.target_end_date} onChange={e => setForm(f => ({ ...f, target_end_date: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{isNew ? 'Add stage' : 'Save'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function ContactDialog({ value, projectId, onClose, onSaved }: { value: Contact | 'new' | null; projectId: string; onClose: () => void; onSaved: (c: Contact, isNew: boolean) => void }) {
  const supabase = createClient()
  const isNew = value === 'new'
  const initial = (isNew || !value) ? { name: '', role: '', phone: '', email: '', is_primary: false } : { name: value.name, role: value.role ?? '', phone: value.phone ?? '', email: value.email ?? '', is_primary: value.is_primary }
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  if (!value) return null
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (isNew) {
      const { data, error } = await supabase.from('project_contacts').insert({ project_id: projectId, name: form.name, role: form.role || null, phone: form.phone || null, email: form.email || null, is_primary: form.is_primary }).select('*').single()
      setBusy(false); if (error || !data) return; onSaved(data as Contact, true)
    } else {
      const id = (value as Contact).id
      const { data, error } = await supabase.from('project_contacts').update({ name: form.name, role: form.role || null, phone: form.phone || null, email: form.email || null, is_primary: form.is_primary }).eq('id', id).select('*').single()
      setBusy(false); if (error || !data) return; onSaved(data as Contact, false)
    }
  }
  return (
    <Dialog open onClose={onClose} title={isNew ? 'Add contact' : 'Edit contact'}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Name <span className="text-red-400">*</span></Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
        <div><Label>Role</Label><Input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Owner, Architect, Council" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} /> Primary contact</label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{isNew ? 'Add contact' : 'Save'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function SubDialog({ value, projectId, onClose, onSaved }: { value: Sub | 'new' | null; projectId: string; onClose: () => void; onSaved: (s: Sub, isNew: boolean) => void }) {
  const supabase = createClient()
  const isNew = value === 'new'
  const initial = (isNew || !value) ? { name: '', trade: '', phone: '', email: '', notes: '' } : { name: value.name, trade: value.trade ?? '', phone: value.phone ?? '', email: value.email ?? '', notes: value.notes ?? '' }
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  if (!value) return null
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (isNew) {
      const { data, error } = await supabase.from('project_subcontractors').insert({ project_id: projectId, name: form.name, trade: form.trade || null, phone: form.phone || null, email: form.email || null, notes: form.notes || null }).select('*').single()
      setBusy(false); if (error || !data) return; onSaved(data as Sub, true)
    } else {
      const id = (value as Sub).id
      const { data, error } = await supabase.from('project_subcontractors').update({ name: form.name, trade: form.trade || null, phone: form.phone || null, email: form.email || null, notes: form.notes || null }).eq('id', id).select('*').single()
      setBusy(false); if (error || !data) return; onSaved(data as Sub, false)
    }
  }
  return (
    <Dialog open onClose={onClose} title={isNew ? 'Add subcontractor' : 'Edit subcontractor'}>
      <form onSubmit={save} className="space-y-3">
        <div><Label>Name <span className="text-red-400">*</span></Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus /></div>
        <div><Label>Trade</Label><Input value={form.trade} onChange={e => setForm(f => ({ ...f, trade: e.target.value }))} placeholder="e.g. Electrical, Plumbing, Tiling" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        </div>
        <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{isNew ? 'Add subbie' : 'Save'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditProjectDialog({ open, project, customers, team, onClose, onSaved }: { open: boolean; project: Project; customers: Customer[]; team: Profile[]; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [form, setForm] = useState({
    name: project.name, description: project.description ?? '',
    customer_id: project.customer_id ?? '', project_manager_id: project.project_manager_id ?? '',
    status: project.status, total_budget: project.total_budget?.toString() ?? '',
    target_end_date: project.target_end_date ?? '',
  })
  const [busy, setBusy] = useState(false)
  if (!open) return null
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('projects').update({
      name: form.name, description: form.description || null,
      customer_id: form.customer_id || null, project_manager_id: form.project_manager_id || null,
      status: form.status, total_budget: form.total_budget ? parseFloat(form.total_budget) : null,
      target_end_date: form.target_end_date || null,
    }).eq('id', project.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    onSaved()
  }
  return (
    <Dialog open onClose={onClose} title="Edit project">
      <form onSubmit={save} className="space-y-3">
        <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
        <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Customer</Label>
            <Select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} placeholder="None"
              options={customers.map(c => ({ value: c.id, label: c.name }))} /></div>
          <div><Label>Project manager</Label>
            <Select value={form.project_manager_id} onChange={e => setForm(f => ({ ...f, project_manager_id: e.target.value }))} placeholder="Unassigned"
              options={team.map(t => ({ value: t.id, label: t.full_name }))} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Status</Label>
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} options={[
              { value: 'planning', label: 'Planning' }, { value: 'active', label: 'Active' },
              { value: 'on_hold', label: 'On hold' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
            ]} /></div>
          <div><Label>Budget ($)</Label><Input type="number" step="0.01" value={form.total_budget} onChange={e => setForm(f => ({ ...f, total_budget: e.target.value }))} /></div>
          <div><Label>Target end</Label><Input type="date" value={form.target_end_date} onChange={e => setForm(f => ({ ...f, target_end_date: e.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Dialog>
  )
}
