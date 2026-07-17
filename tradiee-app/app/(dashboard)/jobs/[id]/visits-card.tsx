'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TimePicker } from '@/components/ui/time-picker'
import { Edit2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface Visit {
  id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string | null
  profiles: { full_name: string } | null
}

function toHHMM(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function VisitsCard({ visits: initialVisits }: { visits: Visit[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [visits, setVisits] = useState(initialVisits)
  const [editVisit, setEditVisit] = useState<Visit | null>(null)
  const [editForm, setEditForm] = useState({ date: '', startTime: '08:00', endMode: 'hours' as 'hours' | 'endTime', durationHours: '2', endTime: '10:00' })
  const [loading, setLoading] = useState(false)

  function openEdit(v: Visit) {
    const start = new Date(v.scheduled_start)
    const end = new Date(v.scheduled_end)
    const dh = Math.round((end.getTime() - start.getTime()) / 360000) / 10
    setEditForm({
      date: start.toISOString().slice(0, 10),
      startTime: toHHMM(start),
      endMode: 'hours',
      durationHours: String(dh),
      endTime: toHHMM(end),
    })
    setEditVisit(v)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editVisit) return
    setLoading(true)
    const newStart = new Date(`${editForm.date}T${editForm.startTime}:00`)
    let newEnd: Date
    if (editForm.endMode === 'hours') {
      newEnd = new Date(newStart.getTime() + (parseFloat(editForm.durationHours) || 1) * 3600000)
    } else {
      newEnd = new Date(`${editForm.date}T${editForm.endTime}:00`)
      if (newEnd <= newStart) newEnd = new Date(newStart.getTime() + 3600000)
    }
    await supabase.from('job_visits').update({
      scheduled_start: newStart.toISOString(),
      scheduled_end: newEnd.toISOString(),
    }).eq('id', editVisit.id)
    setVisits(vs => vs.map(v => v.id === editVisit.id
      ? { ...v, scheduled_start: newStart.toISOString(), scheduled_end: newEnd.toISOString() }
      : v
    ))
    setEditVisit(null)
    setLoading(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader><CardTitle>Scheduled visits</CardTitle></CardHeader>
      <CardContent className="p-0">
        {visits.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-4">No visits scheduled yet</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {visits.map(v => (
              <li key={v.id} className="px-6 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{formatDateTime(v.scheduled_start)}</p>
                  <p className="text-xs text-gray-400">to {formatDateTime(v.scheduled_end)} · {v.profiles?.full_name ?? 'Unassigned'}</p>
                  {v.notes && <p className="text-xs text-gray-500 mt-0.5">{v.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={v.status} />
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                    title="Edit time"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!editVisit} onClose={() => setEditVisit(null)} title="Edit visit time">
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div>
              <Label>Start time</Label>
              <TimePicker value={editForm.startTime} onChange={v => setEditForm(f => ({ ...f, startTime: v }))} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="mb-0">Duration</Label>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
                {(['hours', 'endTime'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => setEditForm(f => ({ ...f, endMode: m }))}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${editForm.endMode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                  >
                    {m === 'hours' ? 'Hours' : 'End time'}
                  </button>
                ))}
              </div>
            </div>
            {editForm.endMode === 'hours' ? (
              <div className="flex items-center gap-2">
                <Input type="number" min="0.25" max="24" step="0.25"
                  value={editForm.durationHours}
                  onChange={e => setEditForm(f => ({ ...f, durationHours: e.target.value }))}
                  className="w-24"
                />
                <span className="text-sm text-gray-500">hours</span>
              </div>
            ) : (
              <TimePicker value={editForm.endTime} onChange={v => setEditForm(f => ({ ...f, endTime: v }))} />
            )}
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={loading}>Save changes</Button>
            <Button type="button" variant="outline" onClick={() => setEditVisit(null)}>Cancel</Button>
          </div>
        </form>
      </Dialog>
    </Card>
  )
}
