'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { formatDate, formatDuration, formatCurrency } from '@/lib/utils'
import { formatTime } from '@/lib/datetime'
import { Pencil, Trash2 } from 'lucide-react'

export type TimesheetRow = {
  id: string
  job_id: string | null
  started_at: string
  ended_at: string | null
  break_minutes: number
  bill_rate: number | null
  is_billable: boolean
  notes: string | null
  profiles?: { full_name: string } | null
  jobs?: { job_number: string; title: string } | null
}

interface Props {
  timesheets: TimesheetRow[]
  jobs: { id: string; job_number: string; title: string }[]
  timezone: string
  showPerson?: boolean
  showJob?: boolean
}

export function TimesheetTable({ timesheets, jobs, timezone, showPerson = true, showJob = true }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [editing, setEditing] = useState<TimesheetRow | null>(null)
  const [form, setForm] = useState({ jobId: '', start: '', end: '', breakMinutes: '0', billRate: '', isBillable: true, notes: '' })
  const [saving, setSaving] = useState(false)

  function openEdit(t: TimesheetRow) {
    setEditing(t)
    setForm({
      jobId: t.job_id ?? '',
      start: t.started_at.slice(0, 16),
      end: t.ended_at ? t.ended_at.slice(0, 16) : '',
      breakMinutes: String(t.break_minutes ?? 0),
      billRate: t.bill_rate?.toString() ?? '',
      isBillable: t.is_billable,
      notes: t.notes ?? '',
    })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    const { error } = await supabase.from('timesheets').update({
      job_id: form.jobId || null,
      started_at: form.start,
      ended_at: form.end || null,
      break_minutes: parseInt(form.breakMinutes) || 0,
      bill_rate: form.billRate ? parseFloat(form.billRate) : null,
      is_billable: form.isBillable,
      notes: form.notes.trim() || null,
    }).eq('id', editing.id)
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Time log updated')
    setEditing(null)
    router.refresh()
  }

  async function deleteTimesheet(t: TimesheetRow) {
    if (!confirm('Delete this time log? This can\'t be undone.')) return
    const { error } = await supabase.from('timesheets').delete().eq('id', t.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Time log deleted')
    router.refresh()
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
            {showPerson && <th className="text-left px-6 py-3 font-medium">Person</th>}
            {showJob && <th className="text-left px-6 py-3 font-medium">Job</th>}
            <th className="text-left px-6 py-3 font-medium">Date</th>
            <th className="text-left px-6 py-3 font-medium">Start</th>
            <th className="text-left px-6 py-3 font-medium">Duration</th>
            <th className="text-right px-6 py-3 font-medium">Rate</th>
            <th className="text-left px-6 py-3 font-medium">Billable</th>
            <th className="px-6 py-3 w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {timesheets.map(t => (
            <tr key={t.id} className="hover:bg-gray-50 group">
              {showPerson && <td className="px-6 py-3 text-gray-700">{t.profiles?.full_name ?? '—'}</td>}
              {showJob && (
                <td className="px-6 py-3 text-gray-600">
                  {t.jobs ? <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{t.jobs.job_number}</span> : '—'}
                </td>
              )}
              <td className="px-6 py-3 text-gray-500">{formatDate(t.started_at)}</td>
              <td className="px-6 py-3 text-gray-500">{formatTime(t.started_at, timezone, { hour12: true })}</td>
              <td className="px-6 py-3 font-medium text-gray-800">
                {t.ended_at ? formatDuration(t.started_at, t.ended_at, t.break_minutes) : <span className="text-yellow-500">Running</span>}
              </td>
              <td className="px-6 py-3 text-right text-gray-500">{t.bill_rate ? formatCurrency(t.bill_rate) + '/hr' : '—'}</td>
              <td className="px-6 py-3">{t.is_billable ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
              <td className="px-6 py-3">
                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100">
                  <button onClick={() => openEdit(t)} aria-label="Edit time log"><Pencil className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" /></button>
                  <button onClick={() => deleteTimesheet(t)} aria-label="Delete time log"><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit time log">
        <form onSubmit={saveEdit} className="space-y-4">
          <div>
            <Label>Job (optional)</Label>
            <Select value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))} placeholder="No job / admin time"
              options={jobs.map(j => ({ value: j.id, label: `${j.job_number} — ${j.title}` }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start <span className="text-red-400">*</span></Label><Input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} required /></div>
            <div><Label>End</Label><Input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Break (minutes)</Label><Input type="number" value={form.breakMinutes} onChange={e => setForm(f => ({ ...f, breakMinutes: e.target.value }))} /></div>
            <div><Label>Bill rate ($/hr)</Label><Input type="number" step="0.01" value={form.billRate} onChange={e => setForm(f => ({ ...f, billRate: e.target.value }))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isBillable} onChange={e => setForm(f => ({ ...f, isBillable: e.target.checked }))} className="rounded" />
            Billable time
          </label>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>Save changes</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
