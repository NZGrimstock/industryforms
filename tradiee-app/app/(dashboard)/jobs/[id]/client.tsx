'use client'
import { useState, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PowerSyncContext } from '@powersync/react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { Plus, MessageSquare, Clock, Receipt, Settings2, Users, Calendar, UserPlus, Printer } from 'lucide-react'
import { TimePicker } from '@/components/ui/time-picker'
import { PrintJobSheet } from '@/components/pdf/print-job-sheet'
import { InviteSubcontractorModal } from '@/components/jobs/InviteSubcontractorModal'
import type { JobSheetData } from '@/components/pdf/job-sheet-pdf'

interface Props {
  job: { id: string; job_number: string; status: string; customer_id: string; title: string; description: string | null; tags: string[] | null; assigned_to: string | null }
  companyId: string
  profileId: string
  team: { id: string; full_name: string }[]
  assignees: { profile_id: string }[]
  projectAddress: string | null
  sheetData: JobSheetData
  gstRate: number
  nextInvoiceNumber: string
  jobTotal: number
  quoteId: string | null
  alreadyInvoiced: number
  actualLines: { description: string; quantity: number; unit: string; unit_price: number; type: 'material' | 'labour' }[]
  actualTotal: number
  jobStatuses: { key: string; label: string; is_terminal?: boolean }[]
}

type JobDialog = 'schedule' | 'assign' | 'both' | 'note' | 'timesheet' | null

export function JobDetailClient({ job, companyId, profileId, team, assignees, projectAddress, sheetData, gstRate, nextInvoiceNumber, jobTotal, quoteId, alreadyInvoiced, actualLines, actualTotal, jobStatuses }: Props) {
  const supabase = createClient()
  const db = useContext(PowerSyncContext)
  const router = useRouter()
  const { toast } = useToast()
  const [activeDialog, setActiveDialog] = useState<JobDialog>(null)
  const [subOpen, setSubOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [visitForm, setVisitForm] = useState({ date: '', startTime: '08:00', endMode: 'hours' as 'hours' | 'endTime', durationHours: '2', endTime: '10:00', assignedTo: '', notes: '' })
  const [noteBody, setNoteBody] = useState('')
  const [timesheetForm, setTimesheetForm] = useState({ start: '', end: '', breakMinutes: '0', billRate: '', isBillable: true })
  const [progressPct, setProgressPct] = useState('50')

  // Selected workers (ordered — first is the primary/lead assignee).
  const initialChecked = [job.assigned_to, ...assignees.map(a => a.profile_id)].filter((id): id is string => !!id)
  const [assignChecked, setAssignChecked] = useState<string[]>(initialChecked)
  function toggleWorker(id: string) {
    setAssignChecked(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function openScheduleAssign(mode: Exclude<JobDialog, null>) {
    setAssignChecked(initialChecked)
    setActiveDialog(mode)
  }

  // --- writes (each returns an error message or null; caller closes+refreshes) ---
  async function createVisit(assignee: string | null): Promise<string | null> {
    const scheduledStart = new Date(`${visitForm.date}T${visitForm.startTime}:00`)
    let scheduledEnd: Date
    if (visitForm.endMode === 'hours') {
      const hrs = parseFloat(visitForm.durationHours) || 1
      scheduledEnd = new Date(scheduledStart.getTime() + hrs * 3600000)
    } else {
      scheduledEnd = new Date(`${visitForm.date}T${visitForm.endTime}:00`)
      if (scheduledEnd <= scheduledStart) scheduledEnd = new Date(scheduledStart.getTime() + 3600000)
    }
    const { error } = await supabase.from('job_visits').insert({
      job_id: job.id,
      assigned_to: assignee,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      notes: visitForm.notes || null,
      status: 'scheduled',
    })
    if (error) return error.message
    if (job.status === 'unscheduled') {
      if (db) await db.execute('UPDATE jobs SET status = ? WHERE id = ?', ['scheduled', job.id])
      if (navigator.onLine) await supabase.from('jobs').update({ status: 'scheduled' }).eq('id', job.id)
    }
    if (assignee) {
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'job_assigned', payload: { jobId: job.id, assignedToId: assignee, jobTitle: job.title, jobNumber: job.job_number } }),
      }).catch(() => {})
    }
    return null
  }

  // Persist the ticked workers: first = primary (jobs.assigned_to), rest = job_assignees.
  async function saveWorkers(): Promise<string | null> {
    const primary = assignChecked[0] ?? null
    const extras = assignChecked.slice(1)
    if (db) await db.execute('UPDATE jobs SET assigned_to = ? WHERE id = ?', [primary, job.id])
    if (navigator.onLine) {
      const { error } = await supabase.from('jobs').update({ assigned_to: primary }).eq('id', job.id)
      if (error) return error.message
      await supabase.from('job_assignees').delete().eq('job_id', job.id)
      if (extras.length) {
        const { error: aErr } = await supabase.from('job_assignees').insert(extras.map(pid => ({ job_id: job.id, profile_id: pid })))
        if (aErr) return aErr.message
      }
    }
    return null
  }

  async function submitScheduleAssign(e: React.FormEvent) {
    e.preventDefault()
    const mode = activeDialog
    setLoading(true)
    try {
      if (mode === 'assign') {
        const err = await saveWorkers()
        if (err) { toast(err, 'error'); return }
        toast(assignChecked.length ? 'Workers assigned' : 'Job unassigned')
      } else if (mode === 'schedule' || mode === 'both') {
        if (!visitForm.date || !visitForm.startTime) { toast('Date and start time are required', 'error'); return }
        const visitAssignee = mode === 'both' ? (assignChecked[0] ?? null) : (visitForm.assignedTo || null)
        const vErr = await createVisit(visitAssignee)
        if (vErr) { toast(vErr, 'error'); return }
        if (mode === 'both') {
          const wErr = await saveWorkers()
          if (wErr) { toast(wErr, 'error'); return }
        }
        toast(mode === 'both' ? 'Visit scheduled & workers assigned' : 'Visit scheduled')
      }
      setActiveDialog(null)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    if (db) {
      await db.execute('INSERT INTO job_notes (id, job_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [id, job.id, profileId, noteBody, now])
    }
    if (navigator.onLine) {
      const { error } = await supabase.from('job_notes').upsert({ id, job_id: job.id, author_id: profileId, body: noteBody, created_at: now })
      if (error) { toast(error.message, 'error'); setLoading(false); return }
      toast('Note added')
      router.refresh()
    } else {
      toast('Note saved — will sync when back online')
    }
    setNoteBody('')
    setActiveDialog(null)
    setLoading(false)
  }

  async function addTimesheet(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const id = crypto.randomUUID()
    const breakMins = parseInt(timesheetForm.breakMinutes) || 0
    const billRate = timesheetForm.billRate ? parseFloat(timesheetForm.billRate) : null
    if (db) {
      await db.execute(
        `INSERT INTO timesheets (id, company_id, job_id, profile_id, started_at, ended_at, break_minutes, bill_rate, is_billable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, companyId, job.id, profileId, timesheetForm.start, timesheetForm.end || null, breakMins, billRate, timesheetForm.isBillable ? 1 : 0]
      )
    }
    if (navigator.onLine) {
      const { error } = await supabase.from('timesheets').upsert({
        id, company_id: companyId, job_id: job.id, profile_id: profileId,
        started_at: timesheetForm.start, ended_at: timesheetForm.end || null,
        break_minutes: breakMins, bill_rate: billRate, is_billable: timesheetForm.isBillable,
      })
      if (error) { toast(error.message, 'error'); setLoading(false); return }
      toast('Time logged')
      router.refresh()
    } else {
      toast('Time logged — will sync when back online')
    }
    setActiveDialog(null)
    setLoading(false)
  }

  const doneStatus = jobStatuses.find(s => s.is_terminal && s.key !== 'cancelled') ?? jobStatuses.find(s => s.key === 'completed')

  // Invoice from the dropdown. Quote/Actuals mark the job complete first (matches
  // the old "Complete & invoice"); a progress claim does NOT (the job is mid-flight).
  async function createInvoice(basis: 'quote' | 'actuals' | 'progress') {
    const isProgress = basis === 'progress'
    const pct = parseFloat(progressPct) / 100
    const EPS = 0.01
    const remaining = jobTotal - alreadyInvoiced

    let lineItemsToInsert: { description: string; quantity: number; unit: string; unit_price: number; line_total: number; type: string }[]
    let subtotal: number

    if (isProgress) {
      subtotal = jobTotal * pct
      lineItemsToInsert = [{ description: `Progress claim — ${progressPct}% of quoted works`, quantity: 1, unit: 'each', unit_price: subtotal, line_total: subtotal, type: 'misc' }]
    } else if (basis === 'actuals') {
      if (actualLines.length === 0) { toast('No logged time or materials to invoice yet.', 'error'); return }
      lineItemsToInsert = actualLines.map(l => ({ description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, line_total: l.quantity * l.unit_price, type: l.type }))
      if (alreadyInvoiced > EPS) {
        lineItemsToInsert.push({ description: 'Less previously invoiced', quantity: 1, unit: 'each', unit_price: -alreadyInvoiced, line_total: -alreadyInvoiced, type: 'misc' })
      }
      subtotal = actualTotal - (alreadyInvoiced > EPS ? alreadyInvoiced : 0)
      if (subtotal <= EPS) { toast('Actual costs are already fully covered by prior invoices.', 'error'); return }
    } else if (alreadyInvoiced > EPS && remaining > EPS) {
      subtotal = remaining
      lineItemsToInsert = [{ description: `Balance of works — ${job.title}`, quantity: 1, unit: 'each', unit_price: remaining, line_total: remaining, type: 'misc' }]
    } else if (alreadyInvoiced > EPS) {
      subtotal = 0
      lineItemsToInsert = []
    } else if (quoteId) {
      const { data } = await supabase.from('quote_line_items').select('description, quantity, unit, unit_price, line_total, type').eq('quote_id', quoteId).order('sort_order')
      const quoteLines = (data ?? []) as typeof lineItemsToInsert
      if (quoteLines.length > 0) { lineItemsToInsert = quoteLines; subtotal = quoteLines.reduce((s, l) => s + Number(l.line_total), 0) }
      else { subtotal = jobTotal; lineItemsToInsert = [{ description: `Completed works — ${job.title}`, quantity: 1, unit: 'each', unit_price: jobTotal, line_total: jobTotal, type: 'misc' }] }
    } else {
      subtotal = jobTotal
      lineItemsToInsert = [{ description: `Completed works — ${job.title}`, quantity: 1, unit: 'each', unit_price: jobTotal, line_total: jobTotal, type: 'misc' }]
    }

    const projected = alreadyInvoiced + subtotal
    if (lineItemsToInsert.length === 0) {
      if (!confirm(`This job's quoted value (${formatCurrency(jobTotal)}) is already fully invoiced.\n\nCreate another invoice for variations / extra work? You'll add the extra line items on the invoice.`)) return
    } else if (jobTotal > 0 && projected > jobTotal + EPS) {
      if (!confirm(`This will bring total invoiced to ${formatCurrency(projected)} — ${formatCurrency(projected - jobTotal)} above the quoted ${formatCurrency(jobTotal)}.\n\nBill above the quote (e.g. for extra time or variations)?`)) return
    }

    setLoading(true)
    // Quote/actuals invoicing marks the job complete first.
    if (!isProgress && doneStatus && job.status !== doneStatus.key) {
      if (db) await db.execute('UPDATE jobs SET status = ? WHERE id = ?', [doneStatus.key, job.id])
      if (navigator.onLine) await supabase.from('jobs').update({ status: doneStatus.key }).eq('id', job.id)
    }

    const gst = subtotal * gstRate
    const { data: inv, error } = await supabase.from('invoices').insert({
      company_id: companyId, customer_id: job.customer_id, job_id: job.id,
      invoice_number: nextInvoiceNumber, reference: (job as { reference?: string | null }).reference ?? null,
      status: 'draft', is_progress_invoice: isProgress, progress_pct: isProgress ? pct : null,
      invoice_date: new Date().toISOString().slice(0, 10), subtotal, gst_amount: gst, total: subtotal + gst, amount_paid: 0,
    }).select().single()
    if (error) { toast(error.message, 'error'); setLoading(false); return }

    if (lineItemsToInsert.length > 0) {
      await supabase.from('invoice_line_items').insert(lineItemsToInsert.map((l, idx) => ({
        invoice_id: inv.id, type: l.type ?? 'misc', description: l.description,
        quantity: Number(l.quantity), unit: l.unit, unit_price: Number(l.unit_price), line_total: Number(l.line_total), sort_order: idx,
      })))
    }
    toast(lineItemsToInsert.length === 0 ? 'Empty invoice created — add your variation lines' : 'Invoice created')
    router.push(`/invoices/${inv.id}`)
  }

  async function updateStatusTo(key: string) {
    if (key === job.status) return
    setLoading(true)
    if (db) await db.execute('UPDATE jobs SET status = ? WHERE id = ?', [key, job.id])
    if (navigator.onLine) {
      const { error } = await supabase.from('jobs').update({ status: key }).eq('id', job.id)
      if (error) { toast(error.message, 'error'); setLoading(false); return }
      toast('Status updated')
      router.refresh()
    } else {
      toast('Status updated — will sync when back online')
    }
    setLoading(false)
  }

  const currentStatusLabel = jobStatuses.find(s => s.key === job.status)?.label ?? 'Status'
  const scheduleTitle = activeDialog === 'assign' ? 'Assign workers' : activeDialog === 'both' ? 'Schedule & assign' : 'Schedule visit'
  const showSchedule = activeDialog === 'schedule' || activeDialog === 'both'
  const showAssign = activeDialog === 'assign' || activeDialog === 'both'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Schedule & Assign */}
      <Dropdown label="Schedule & Assign" icon={<Calendar className="h-4 w-4" />}>
        <DropdownItem icon={<Calendar />} onClick={() => openScheduleAssign('both')}>Schedule and assign</DropdownItem>
        <DropdownItem icon={<Calendar />} onClick={() => openScheduleAssign('schedule')}>Schedule only</DropdownItem>
        <DropdownItem icon={<Users />} onClick={() => openScheduleAssign('assign')}>Assign only</DropdownItem>
      </Dropdown>

      {/* Add */}
      <Dropdown label="Add" icon={<Plus className="h-4 w-4" />}>
        <DropdownItem icon={<MessageSquare />} onClick={() => setActiveDialog('note')}>Note</DropdownItem>
        <DropdownItem icon={<Clock />} onClick={() => setActiveDialog('timesheet')}>Time log</DropdownItem>
        <DropdownItem icon={<Users />} onClick={() => openScheduleAssign('assign')}>Worker</DropdownItem>
        <DropdownItem icon={<UserPlus />} onClick={() => setSubOpen(true)}>Subcontractor</DropdownItem>
      </Dropdown>

      {/* Print */}
      <Dropdown label="Print" icon={<Printer className="h-4 w-4" />}>
        <PrintJobSheet data={sheetData} asMenuItems />
      </Dropdown>

      {/* Status */}
      <Dropdown label={currentStatusLabel} icon={<Settings2 className="h-4 w-4" />}>
        {jobStatuses.map(s => (
          <DropdownItem key={s.key} onClick={() => updateStatusTo(s.key)}>
            <span className={s.key === job.status ? 'font-semibold text-gray-900' : ''}>{s.label}</span>
          </DropdownItem>
        ))}
      </Dropdown>

      {/* Invoice (green, right-aligned) */}
      <div className="ml-auto">
        <Dropdown label="Invoice" icon={<Receipt className="h-4 w-4" />} variant="primary" align="right" panelClassName="min-w-[16rem]">
          <DropdownItem icon={<Receipt />} onClick={() => createInvoice('quote')}>Invoice from quote</DropdownItem>
          <DropdownItem icon={<Receipt />} onClick={() => createInvoice('actuals')}>Invoice from actuals</DropdownItem>
          <div className="border-t border-gray-100 mt-1 pt-2 px-3 pb-2">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Progress claim</p>
            <div className="flex items-center gap-2">
              <input type="range" min="5" max="100" step="5" value={progressPct} onChange={e => setProgressPct(e.target.value)} className="flex-1 accent-green-600" />
              <span className="text-sm font-semibold text-green-700 w-10 text-right">{progressPct}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{formatCurrency(jobTotal * (parseFloat(progressPct) / 100))} of {formatCurrency(jobTotal)}</p>
            <Button size="sm" loading={loading} className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => createInvoice('progress')}>Create progress claim</Button>
          </div>
        </Dropdown>
      </div>

      {/* Subcontractor modal (opened from Add) */}
      <InviteSubcontractorModal jobId={job.id} jobTitle={job.title} projectAddress={projectAddress} open={subOpen} onOpenChange={setSubOpen} />

      {/* Schedule / Assign dialog */}
      <Dialog open={showSchedule || showAssign} onClose={() => setActiveDialog(null)} title={scheduleTitle}>
        <form onSubmit={submitScheduleAssign} className="space-y-4">
          {showSchedule && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date <span className="text-red-400">*</span></Label>
                  <Input type="date" value={visitForm.date} onChange={e => setVisitForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div>
                  <Label>Start time <span className="text-red-400">*</span></Label>
                  <TimePicker value={visitForm.startTime} onChange={v => setVisitForm(f => ({ ...f, startTime: v }))} />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label className="mb-0">Duration</Label>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
                    {(['hours', 'endTime'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setVisitForm(f => ({ ...f, endMode: m }))}
                        className={`px-2 py-1 rounded-md font-medium transition-colors ${visitForm.endMode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                        {m === 'hours' ? 'Hours' : 'End time'}
                      </button>
                    ))}
                  </div>
                </div>
                {visitForm.endMode === 'hours' ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0.25" max="24" step="0.25" value={visitForm.durationHours} onChange={e => setVisitForm(f => ({ ...f, durationHours: e.target.value }))} className="w-24" />
                    <span className="text-sm text-gray-500">hours</span>
                  </div>
                ) : (
                  <TimePicker value={visitForm.endTime} onChange={v => setVisitForm(f => ({ ...f, endTime: v }))} />
                )}
              </div>
              {activeDialog === 'schedule' && (
                <div><Label>Assigned to</Label><Select value={visitForm.assignedTo} onChange={e => setVisitForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Unassigned" options={team.map(t => ({ value: t.id, label: t.full_name }))} /></div>
              )}
              <div><Label>Notes</Label><Textarea value={visitForm.notes} onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            </>
          )}
          {showAssign && (
            <div>
              <Label>Workers</Label>
              <div className="mt-1 space-y-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {team.map(t => {
                  const idx = assignChecked.indexOf(t.id)
                  return (
                    <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={idx !== -1} onChange={() => toggleWorker(t.id)} className="h-4 w-4" />
                      <span className="flex-1">{t.full_name}</span>
                      {idx === 0 && <span className="text-[11px] font-medium text-[var(--accent,#f97316)]">Lead</span>}
                    </label>
                  )
                })}
                {team.length === 0 && <p className="text-sm text-gray-400 px-2 py-1">No team members yet.</p>}
              </div>
              <p className="text-xs text-gray-400 mt-1">First selected is the lead worker (shown on the map & their phone).</p>
            </div>
          )}
          <div className="flex gap-3">
            <Button type="submit" loading={loading}>{activeDialog === 'assign' ? 'Save' : 'Schedule'}</Button>
            <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
          </div>
        </form>
      </Dialog>

      {/* Add note */}
      <Dialog open={activeDialog === 'note'} onClose={() => setActiveDialog(null)} title="Add note">
        <form onSubmit={addNote} className="space-y-4">
          <Textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} rows={5} required placeholder="Note..." />
          <div className="flex gap-3"><Button type="submit" loading={loading}>Add note</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </form>
      </Dialog>

      {/* Log time */}
      <Dialog open={activeDialog === 'timesheet'} onClose={() => setActiveDialog(null)} title="Log time">
        <form onSubmit={addTimesheet} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start <span className="text-red-400">*</span></Label><Input type="datetime-local" value={timesheetForm.start} onChange={e => setTimesheetForm(f => ({ ...f, start: e.target.value }))} required /></div>
            <div><Label>End</Label><Input type="datetime-local" value={timesheetForm.end} onChange={e => setTimesheetForm(f => ({ ...f, end: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Break (minutes)</Label><Input type="number" value={timesheetForm.breakMinutes} onChange={e => setTimesheetForm(f => ({ ...f, breakMinutes: e.target.value }))} /></div>
            <div><Label>Bill rate ($/hr)</Label><Input type="number" step="0.01" value={timesheetForm.billRate} onChange={e => setTimesheetForm(f => ({ ...f, billRate: e.target.value }))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={timesheetForm.isBillable} onChange={e => setTimesheetForm(f => ({ ...f, isBillable: e.target.checked }))} /> Billable</label>
          <div className="flex gap-3"><Button type="submit" loading={loading}>Log time</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </form>
      </Dialog>
    </div>
  )
}
