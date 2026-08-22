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
import { Plus } from 'lucide-react'
import { now } from '@/lib/utils'

interface Props {
  companyId: string
  profileId: string
  jobs: { id: string; job_number: string; title: string }[]
  billRate: number | null
}

export function TimesheetActions({ companyId, profileId, jobs, billRate }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState({
    jobId: '',
    start: new Date(now() - 3600000).toISOString().slice(0, 16),
    end: new Date().toISOString().slice(0, 16),
    breakMinutes: '0',
    billRate: billRate?.toString() ?? '',
    isBillable: true,
    notes: '',
  })

  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('timesheets').insert({
      company_id: companyId,
      job_id: form.jobId || null,
      profile_id: profileId,
      started_at: form.start,
      ended_at: form.end || null,
      break_minutes: parseInt(form.breakMinutes) || 0,
      bill_rate: form.billRate ? parseFloat(form.billRate) : null,
      is_billable: form.isBillable,
      notes: form.notes || null,
    })
    if (error) toast(error.message, 'error')
    else { toast('Time logged'); setOpen(false); router.refresh() }
    setLoading(false)
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Log time</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Log time">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Job (optional)</Label>
            <Select value={form.jobId} onChange={e => set('jobId', e.target.value)} placeholder="No job / admin time"
              options={jobs.map(j => ({ value: j.id, label: `${j.job_number} — ${j.title}` }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start <span className="text-red-400">*</span></Label><Input type="datetime-local" value={form.start} onChange={e => set('start', e.target.value)} required /></div>
            <div><Label>End</Label><Input type="datetime-local" value={form.end} onChange={e => set('end', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Break (minutes)</Label><Input type="number" value={form.breakMinutes} onChange={e => set('breakMinutes', e.target.value)} /></div>
            <div><Label>Bill rate ($/hr)</Label><Input type="number" step="0.01" value={form.billRate} onChange={e => set('billRate', e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isBillable} onChange={e => set('isBillable', e.target.checked)} className="rounded" />
            Billable time
          </label>
          <div className="flex gap-3">
            <Button type="submit" loading={loading}>Log time</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
