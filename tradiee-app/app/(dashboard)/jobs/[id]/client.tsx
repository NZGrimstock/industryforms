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
import { Plus, MessageSquare, Clock, Receipt, Settings2, UserCog, CheckCircle2 } from 'lucide-react'

interface Props {
  job: { id: string; job_number: string; status: string; customer_id: string; title: string; description: string | null; tags: string[] | null; assigned_to: string | null }
  companyId: string
  profileId: string
  team: { id: string; full_name: string }[]
  gstRate: number
  nextInvoiceNumber: string
  jobTotal: number
  quoteId: string | null
  alreadyInvoiced: number
  actualLines: { description: string; quantity: number; unit: string; unit_price: number; type: 'material' | 'labour' }[]
  actualTotal: number
  jobStatuses: { key: string; label: string; is_terminal?: boolean }[]
}

export function JobDetailClient({ job, companyId, profileId, team, gstRate, nextInvoiceNumber, jobTotal, quoteId, alreadyInvoiced, actualLines, actualTotal, jobStatuses }: Props) {
  const supabase = createClient()
  const db = useContext(PowerSyncContext)
  const router = useRouter()
  const { toast } = useToast()
  const [activeDialog, setActiveDialog] = useState<'visit' | 'note' | 'timesheet' | 'invoice' | 'status' | 'assign' | null>(null)
  const [loading, setLoading] = useState(false)
  const [newAssignee, setNewAssignee] = useState(job.assigned_to ?? '')

  const [visitForm, setVisitForm] = useState({ start: '', end: '', assignedTo: '', notes: '' })
  const [noteBody, setNoteBody] = useState('')
  const [timesheetForm, setTimesheetForm] = useState({ start: '', end: '', breakMinutes: '0', billRate: '', isBillable: true })
  const [newStatus, setNewStatus] = useState(job.status)
  const [invoiceType, setInvoiceType] = useState<'full' | 'progress'>('full')
  const [invoiceBasis, setInvoiceBasis] = useState<'quote' | 'actuals'>('quote')
  const [progressPct, setProgressPct] = useState('50')

  // Visits are office-scheduled so go direct to Supabase (not offline-critical)
  async function addVisit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('job_visits').insert({
      job_id: job.id,
      assigned_to: visitForm.assignedTo || null,
      scheduled_start: visitForm.start,
      scheduled_end: visitForm.end,
      notes: visitForm.notes || null,
      status: 'scheduled',
    })
    if (error) { toast(error.message, 'error'); setLoading(false); return }

    if (visitForm.assignedTo) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'job_assigned',
          payload: { jobId: job.id, assignedToId: visitForm.assignedTo, jobTitle: job.title, jobNumber: job.job_number },
        }),
      }).catch(() => {})
    }

    toast('Visit scheduled')
    setActiveDialog(null)
    router.refresh()
    setLoading(false)
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (db) {
      // Write locally first so it persists even if offline
      await db.execute(
        'INSERT INTO job_notes (id, job_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, job.id, profileId, noteBody, now]
      )
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
        `INSERT INTO timesheets
           (id, company_id, job_id, profile_id, started_at, ended_at, break_minutes, bill_rate, is_billable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, companyId, job.id, profileId,
         timesheetForm.start,
         timesheetForm.end || null,
         breakMins,
         billRate,
         timesheetForm.isBillable ? 1 : 0]
      )
    }

    if (navigator.onLine) {
      const { error } = await supabase.from('timesheets').upsert({
        id,
        company_id: companyId,
        job_id: job.id,
        profile_id: profileId,
        started_at: timesheetForm.start,
        ended_at: timesheetForm.end || null,
        break_minutes: breakMins,
        bill_rate: billRate,
        is_billable: timesheetForm.isBillable,
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

  async function createInvoice() {
    const isProgress = invoiceType === 'progress'
    const pct = parseFloat(progressPct) / 100
    const EPS = 0.01
    const remaining = jobTotal - alreadyInvoiced

    setLoading(true)

    // Fetch quote line items to copy onto the invoice
    type RawLine = { description: string; quantity: number; unit: string; unit_price: number; line_total: number; type: string }
    let quoteLines: RawLine[] = []
    if (quoteId) {
      const { data } = await supabase
        .from('quote_line_items')
        .select('description, quantity, unit, unit_price, line_total, type')
        .eq('quote_id', quoteId)
        .order('sort_order')
      quoteLines = (data ?? []) as RawLine[]
    }

    const isActuals = !isProgress && invoiceBasis === 'actuals'

    // Build the line items to insert and calculate subtotal from them
    let lineItemsToInsert: RawLine[]
    let subtotal: number

    if (isProgress) {
      subtotal = jobTotal * pct
      lineItemsToInsert = [{
        description: `Progress claim — ${progressPct}% of quoted works`,
        quantity: 1,
        unit: 'each',
        unit_price: subtotal,
        line_total: subtotal,
        type: 'misc',
      }]
    } else if (isActuals) {
      // Bill the actual logged time & materials (reflects overruns / under-runs)
      if (actualLines.length === 0) {
        toast('No logged time or materials to invoice yet.', 'error'); setLoading(false); return
      }
      lineItemsToInsert = actualLines.map(l => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        line_total: l.quantity * l.unit_price,
        type: l.type,
      }))
      // Deduct anything already billed (e.g. progress claims) so we only charge the balance
      if (alreadyInvoiced > EPS) {
        lineItemsToInsert.push({
          description: 'Less previously invoiced',
          quantity: 1,
          unit: 'each',
          unit_price: -alreadyInvoiced,
          line_total: -alreadyInvoiced,
          type: 'misc',
        })
      }
      subtotal = actualTotal - (alreadyInvoiced > EPS ? alreadyInvoiced : 0)
      if (subtotal <= EPS) {
        toast('Actual costs are already fully covered by prior invoices.', 'error'); setLoading(false); return
      }
    } else if (alreadyInvoiced > EPS && remaining > EPS) {
      // Full invoice after a prior (progress) invoice — bill the remaining balance of the quote
      subtotal = remaining
      lineItemsToInsert = [{
        description: `Balance of works — ${job.title}`,
        quantity: 1,
        unit: 'each',
        unit_price: remaining,
        line_total: remaining,
        type: 'misc',
      }]
    } else if (alreadyInvoiced > EPS) {
      // Quote already fully invoiced — any further invoice is for variations / extra work.
      // Start empty so the user adds the actual variation lines on the invoice.
      subtotal = 0
      lineItemsToInsert = []
    } else if (quoteLines.length > 0) {
      lineItemsToInsert = quoteLines
      subtotal = quoteLines.reduce((sum, l) => sum + Number(l.line_total), 0)
    } else {
      // No quote — single summary line
      subtotal = jobTotal
      lineItemsToInsert = [{
        description: `Completed works — ${job.title}`,
        quantity: 1,
        unit: 'each',
        unit_price: jobTotal,
        line_total: jobTotal,
        type: 'misc',
      }]
    }

    // Over-invoicing safeguard — confirm rather than block, so genuine overruns
    // and variations can still be billed deliberately.
    const projected = alreadyInvoiced + subtotal
    if (lineItemsToInsert.length === 0) {
      // Empty variation invoice (quote fully invoiced, quote basis)
      if (!confirm(
        `This job's quoted value (${formatCurrency(jobTotal)}) is already fully invoiced.\n\n` +
        `Create another invoice for variations / extra work? You'll add the extra line items on the invoice.`
      )) { setLoading(false); return }
    } else if (jobTotal > 0 && projected > jobTotal + EPS) {
      // About to bill above the quoted total
      if (!confirm(
        `This will bring total invoiced to ${formatCurrency(projected)} — ` +
        `${formatCurrency(projected - jobTotal)} above the quoted ${formatCurrency(jobTotal)}.\n\n` +
        `Bill above the quote (e.g. for extra time or variations)?`
      )) { setLoading(false); return }
    }

    const gst = subtotal * gstRate
    const total = subtotal + gst

    const { data: inv, error } = await supabase.from('invoices').insert({
      company_id: companyId,
      customer_id: job.customer_id,
      job_id: job.id,
      invoice_number: nextInvoiceNumber,
      reference: (job as { reference?: string | null }).reference ?? null,
      status: 'draft',
      is_progress_invoice: isProgress,
      progress_pct: isProgress ? pct : null,
      invoice_date: new Date().toISOString().slice(0, 10),
      subtotal,
      gst_amount: gst,
      total,
      amount_paid: 0,
    }).select().single()
    if (error) { toast(error.message, 'error'); setLoading(false); return }

    if (lineItemsToInsert.length > 0) {
      await supabase.from('invoice_line_items').insert(
        lineItemsToInsert.map((l, idx) => ({
          invoice_id: inv.id,
          type: l.type ?? 'misc',
          description: l.description,
          quantity: Number(l.quantity),
          unit: l.unit,
          unit_price: Number(l.unit_price),
          line_total: Number(l.line_total),
          sort_order: idx,
        }))
      )
    }

    toast(lineItemsToInsert.length === 0 ? 'Empty invoice created — add your variation lines' : 'Invoice created')
    router.push(`/invoices/${inv.id}`)
  }

  async function updateStatus() {
    setLoading(true)

    if (db) {
      await db.execute('UPDATE jobs SET status = ? WHERE id = ?', [newStatus, job.id])
    }

    if (navigator.onLine) {
      const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id)
      if (error) { toast(error.message, 'error'); setLoading(false); return }
      toast('Status updated')
      router.refresh()
    } else {
      toast('Status updated — will sync when back online')
    }

    setActiveDialog(null)
    setLoading(false)
  }

  async function updateAssignment() {
    setLoading(true)
    const value = newAssignee || null
    if (db) {
      await db.execute('UPDATE jobs SET assigned_to = ? WHERE id = ?', [value, job.id])
    }
    if (navigator.onLine) {
      const { error } = await supabase.from('jobs').update({ assigned_to: value }).eq('id', job.id)
      if (error) { toast(error.message, 'error'); setLoading(false); return }
      toast(value ? 'Job assigned' : 'Job unassigned')
      router.refresh()
    } else {
      toast('Assignment updated — will sync when back online')
    }
    setActiveDialog(null)
    setLoading(false)
  }

  const assigneeName = team.find(t => t.id === job.assigned_to)?.full_name
  // The "done" status = first terminal status that isn't a cancellation.
  const doneStatus = jobStatuses.find(s => s.is_terminal && s.key !== 'cancelled') ?? jobStatuses.find(s => s.key === 'completed')
  const isDone = doneStatus ? job.status === doneStatus.key : false

  // One-click chain: mark the job complete and open the invoice dialog in one go.
  async function completeAndInvoice() {
    if (doneStatus && job.status !== doneStatus.key) {
      if (db) await db.execute('UPDATE jobs SET status = ? WHERE id = ?', [doneStatus.key, job.id])
      if (navigator.onLine) {
        const { error } = await supabase.from('jobs').update({ status: doneStatus.key }).eq('id', job.id)
        if (error) { toast(error.message, 'error'); return }
      }
      toast('Job marked complete')
      router.refresh()
    }
    setActiveDialog('invoice')
  }

  return (
    <div className="flex flex-wrap gap-2">
      {doneStatus && !isDone && (
        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={completeAndInvoice}>
          <CheckCircle2 className="h-4 w-4" /> Complete &amp; invoice
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => setActiveDialog('visit')}><Plus className="h-4 w-4" /> Schedule visit</Button>
      <Button variant="outline" size="sm" onClick={() => setActiveDialog('note')}><MessageSquare className="h-4 w-4" /> Add note</Button>
      <Button variant="outline" size="sm" onClick={() => setActiveDialog('timesheet')}><Clock className="h-4 w-4" /> Log time</Button>
      <Button variant="outline" size="sm" onClick={() => setActiveDialog('invoice')}><Receipt className="h-4 w-4" /> Create invoice</Button>
      <Button variant="outline" size="sm" onClick={() => { setNewAssignee(job.assigned_to ?? ''); setActiveDialog('assign') }}><UserCog className="h-4 w-4" /> {assigneeName ? `Assigned: ${assigneeName.split(' ')[0]}` : 'Assign'}</Button>
      <Button variant="secondary" size="sm" onClick={() => setActiveDialog('status')}><Settings2 className="h-4 w-4" /> Status</Button>

      {/* Schedule visit */}
      <Dialog open={activeDialog === 'visit'} onClose={() => setActiveDialog(null)} title="Schedule visit">
        <form onSubmit={addVisit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start <span className="text-red-400">*</span></Label><Input type="datetime-local" value={visitForm.start} onChange={e => setVisitForm(f => ({ ...f, start: e.target.value }))} required /></div>
            <div><Label>End <span className="text-red-400">*</span></Label><Input type="datetime-local" value={visitForm.end} onChange={e => setVisitForm(f => ({ ...f, end: e.target.value }))} required /></div>
          </div>
          <div><Label>Assigned to</Label><Select value={visitForm.assignedTo} onChange={e => setVisitForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Unassigned" options={team.map(t => ({ value: t.id, label: t.full_name }))} /></div>
          <div><Label>Notes</Label><Textarea value={visitForm.notes} onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          <div className="flex gap-3"><Button type="submit" loading={loading}>Schedule</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
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

      {/* Create invoice */}
      <Dialog open={activeDialog === 'invoice'} onClose={() => setActiveDialog(null)} title="Create invoice">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Invoice <strong>{nextInvoiceNumber}</strong>{invoiceType === 'full' && invoiceBasis === 'actuals' ? ' — built from logged time & materials.' : ' — line items will be copied from the quote.'}</p>
          {jobTotal > 0 && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs space-y-1">
              <div className="flex justify-between text-gray-500"><span>Quoted (excl. GST)</span><span className="text-gray-700 font-medium">{formatCurrency(jobTotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Already invoiced</span><span className="text-gray-700 font-medium">{formatCurrency(alreadyInvoiced)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                <span className="text-gray-600 font-medium">Remaining</span>
                <span className={`font-semibold ${jobTotal - alreadyInvoiced <= 0.01 ? 'text-red-500' : 'text-gray-900'}`}>{formatCurrency(jobTotal - alreadyInvoiced)}</span>
              </div>
            </div>
          )}
          {jobTotal > 0 && jobTotal - alreadyInvoiced <= 0.01 && (
            <p className="text-xs text-amber-600">Quote fully invoiced — you can still create another invoice for variations or extra work (you&apos;ll be asked to confirm, then add the extra lines).</p>
          )}
          {invoiceType === 'full' && invoiceBasis === 'quote' && alreadyInvoiced > 0.01 && jobTotal - alreadyInvoiced > 0.01 && (
            <p className="text-xs text-amber-600">A prior invoice exists — this will bill the remaining balance of {formatCurrency(jobTotal - alreadyInvoiced)}.</p>
          )}
          {invoiceType === 'full' && invoiceBasis === 'actuals' && alreadyInvoiced > 0.01 && (
            <p className="text-xs text-amber-600">A prior invoice exists — actuals of {formatCurrency(actualTotal)} will be billed less {formatCurrency(alreadyInvoiced)} already invoiced ({formatCurrency(actualTotal - alreadyInvoiced)}).</p>
          )}
          <div>
            <Label>Invoice type</Label>
            <div className="flex gap-2 mt-1">
              {(['full', 'progress'] as const).map(t => (
                <button key={t} onClick={() => setInvoiceType(t)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${invoiceType === t ? 'bg-[var(--accent,#f97316)] text-white border-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-600 hover:border-[var(--accent,#f97316)]/40'}`}>
                  {t === 'full' ? 'Full invoice' : 'Progress claim'}
                </button>
              ))}
            </div>
          </div>
          {invoiceType === 'full' && (
            <div>
              <Label>Bill from</Label>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setInvoiceBasis('quote')} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${invoiceBasis === 'quote' ? 'bg-[var(--accent,#f97316)] text-white border-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-600 hover:border-[var(--accent,#f97316)]/40'}`}>
                  Quote ({formatCurrency(jobTotal)})
                </button>
                <button onClick={() => setInvoiceBasis('actuals')} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${invoiceBasis === 'actuals' ? 'bg-[var(--accent,#f97316)] text-white border-[var(--accent,#f97316)]' : 'border-gray-200 text-gray-600 hover:border-[var(--accent,#f97316)]/40'}`}>
                  Actuals ({formatCurrency(actualTotal)})
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {invoiceBasis === 'quote'
                  ? 'Bills the quoted line items.'
                  : 'Bills the logged time & materials — use this if the job ran over or under the quote.'}
              </p>
            </div>
          )}
          {invoiceType === 'progress' && (
            <div>
              <Label>Claim percentage</Label>
              <div className="flex items-center gap-3 mt-1">
                <input type="range" min="5" max="100" step="5" value={progressPct} onChange={e => setProgressPct(e.target.value)} className="flex-1 accent-orange-500" />
                <span className="text-sm font-semibold text-[var(--accent,#f97316)] w-12 text-right">{progressPct}%</span>
              </div>
              <div className="flex justify-between mt-1">
                {['25', '50', '75', '100'].map(p => (
                  <button key={p} onClick={() => setProgressPct(p)} className={`text-xs px-2 py-1 rounded ${progressPct === p ? 'bg-orange-100 text-[var(--accent,#f97316)] font-medium' : 'text-gray-400 hover:text-gray-600'}`}>{p}%</button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">A progress claim invoices a percentage of the total quoted value.</p>
            </div>
          )}
          <div className="flex gap-3"><Button loading={loading} onClick={createInvoice}>Create invoice</Button><Button variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </div>
      </Dialog>

      {/* Update status */}
      <Dialog open={activeDialog === 'status'} onClose={() => setActiveDialog(null)} title="Update status">
        <div className="space-y-4">
          <Select value={newStatus} onChange={e => setNewStatus(e.target.value)} options={jobStatuses.map(s => ({ value: s.key, label: s.label }))} />
          <div className="flex gap-3"><Button loading={loading} onClick={updateStatus}>Update</Button><Button variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </div>
      </Dialog>

      {/* Assign to team member */}
      <Dialog open={activeDialog === 'assign'} onClose={() => setActiveDialog(null)} title="Assign job">
        <div className="space-y-4">
          <div>
            <Label>Team member</Label>
            <Select
              value={newAssignee}
              onChange={e => setNewAssignee(e.target.value)}
              placeholder="Unassigned"
              options={team.map(t => ({ value: t.id, label: t.full_name }))}
            />
            <p className="text-xs text-gray-400 mt-1">The assigned member sees this job on their phone and on the job map.</p>
          </div>
          <div className="flex gap-3"><Button loading={loading} onClick={updateAssignment}>Save</Button><Button variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </div>
      </Dialog>
    </div>
  )
}
