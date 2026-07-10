'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Download, MapPin, Clock, Route, Car, CheckCircle2, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/components/providers/timezone-provider'
import { formatDate as formatDateTz, formatTime as formatTimeTz } from '@/lib/datetime'

type Log = {
  id: string
  profile_id: string | null
  started_at: string
  ended_at: string | null
  start_lat: number | null
  start_lng: number | null
  end_lat: number | null
  end_lng: number | null
  distance_km: number | null
  purpose: string | null
  job_id: string | null
  notes: string | null
  is_auto: boolean | null
  verified_at: string | null
  jobs: { job_number: string; title: string } | null
}

type TeamMember = {
  id: string
  full_name: string
  vehicle_registration: string | null
}

type JobOption = { id: string; job_number: string; title: string }

function formatDuration(start: string, end: string | null) {
  if (!end) return 'In progress'
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function formatDate(iso: string, timezone: string) {
  return formatDateTz(iso, timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
function formatTime(iso: string, timezone: string) {
  return formatTimeTz(iso, timezone, { hour12: true })
}

function mapsLink(lat: number | null, lng: number | null) {
  if (!lat || !lng) return null
  return `https://maps.google.com/?q=${lat},${lng}`
}

const PURPOSE_LABELS: Record<string, string> = {
  work: 'Work',
  personal: 'Personal',
  ignore: 'Ignored',
}

function downloadCSV(logs: Log[], team: TeamMember[], timezone: string) {
  const teamById = Object.fromEntries(team.map(t => [t.id, t]))
  const rows = [
    ['Date', 'Team member', 'Vehicle', 'Start time', 'End time', 'Duration', 'Distance (km)', 'Purpose', 'Job', 'Notes', 'Start GPS', 'End GPS'],
    ...logs.map(l => {
      const member = l.profile_id ? teamById[l.profile_id] : null
      return [
        l.started_at ? formatDate(l.started_at, timezone) : '',
        member?.full_name ?? '',
        member?.vehicle_registration ?? '',
        l.started_at ? formatTime(l.started_at, timezone) : '',
        l.ended_at ? formatTime(l.ended_at, timezone) : '',
        formatDuration(l.started_at, l.ended_at),
        l.distance_km?.toFixed(2) ?? '',
        l.purpose ? (PURPOSE_LABELS[l.purpose] ?? l.purpose) : 'Unallocated',
        l.jobs ? `${l.jobs.job_number} — ${l.jobs.title}` : '',
        l.notes ?? '',
        l.start_lat && l.start_lng ? `${l.start_lat},${l.start_lng}` : '',
        l.end_lat && l.end_lng ? `${l.end_lat},${l.end_lng}` : '',
      ]
    })
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'vehicle-logbook.csv'; a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  logs: Log[]
  team: TeamMember[]
  jobs: JobOption[]
  fromDate: string
  toDate: string
  selectedProfileId: string
  companyId: string
}

export function LogbookClient({ logs, team, jobs, fromDate, toDate, selectedProfileId, companyId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const timezone = useTimezone()
  const [localFrom, setLocalFrom] = useState(fromDate)
  const [localTo, setLocalTo] = useState(toDate)
  const [localProfile, setLocalProfile] = useState(selectedProfileId)
  const [tab, setTab] = useState<'gps' | 'logbook'>('gps')
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(
    new Set(logs.filter(l => l.verified_at).map(l => l.id))
  )
  const [verifying, setVerifying] = useState<string | null>(null)
  const [localLogs, setLocalLogs] = useState(logs)
  const [allocatingId, setAllocatingId] = useState<string | null>(null)
  const [draftPurpose, setDraftPurpose] = useState<'work' | 'personal' | 'ignore'>('work')
  const [draftJobId, setDraftJobId] = useState('')
  const [allocSavingId, setAllocSavingId] = useState<string | null>(null)

  useEffect(() => setLocalLogs(logs), [logs])

  async function verifyTrip(logId: string) {
    setVerifying(logId)
    const { error } = await supabase.from('travel_logs').update({ verified_at: new Date().toISOString() }).eq('id', logId)
    setVerifying(null)
    if (!error) setVerifiedIds(prev => new Set([...prev, logId]))
  }

  function startAllocating(logId: string) {
    setAllocatingId(logId)
    setDraftPurpose('work')
    setDraftJobId('')
  }

  async function allocate(logId: string, purpose: 'work' | 'personal' | 'ignore', jobId: string | null) {
    setAllocSavingId(logId)
    const { error } = await supabase.from('travel_logs').update({ purpose, job_id: jobId }).eq('id', logId)
    setAllocSavingId(null)
    if (error) { alert(error.message); return }
    const job = jobId ? jobs.find(j => j.id === jobId) ?? null : null
    setLocalLogs(prev => prev.map(l => l.id === logId ? { ...l, purpose, job_id: jobId, jobs: job } : l))
    setAllocatingId(null)
    router.refresh()
  }

  function applyFilters() {
    const params = new URLSearchParams({ from: localFrom, to: localTo })
    if (localProfile) params.set('profileId', localProfile)
    router.push(`/logbook?${params}`)
  }

  const teamById = Object.fromEntries(team.map(t => [t.id, t]))

  // Group logs by date then by profile
  type DayGroup = { date: string; logs: Log[] }
  const byDay = useMemo((): DayGroup[] => {
    const map = new Map<string, Log[]>()
    for (const l of localLogs) {
      const d = l.started_at.slice(0, 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(l)
    }
    return Array.from(map.entries()).map(([date, logs]) => ({ date, logs }))
  }, [localLogs])

  // Summary stats
  const totalKm = localLogs.reduce((s, l) => s + (l.distance_km ?? 0), 0)
  const workKm = localLogs.filter(l => l.purpose === 'work').reduce((s, l) => s + (l.distance_km ?? 0), 0)
  const totalTrips = localLogs.length
  const avgKm = totalTrips > 0 ? totalKm / totalTrips : 0

  const purposeColor: Record<string, string> = {
    work: 'bg-green-100 text-green-700',
    personal: 'bg-gray-100 text-gray-600',
    ignore: 'bg-gray-100 text-gray-400',
  }

  return (
    <div className="p-6 space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>From</Label>
              <Input type="date" value={localFrom} onChange={e => setLocalFrom(e.target.value)} className="w-36" />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={localTo} onChange={e => setLocalTo(e.target.value)} className="w-36" />
            </div>
            <div>
              <Label>Team member</Label>
              <select
                value={localProfile}
                onChange={e => setLocalProfile(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All members</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="outline" onClick={() => downloadCSV(localLogs, team, timezone)}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total trips', value: totalTrips, icon: Route },
          { label: 'Total km', value: totalKm.toFixed(1) + ' km', icon: Car },
          { label: 'Work km', value: workKm.toFixed(1) + ' km', icon: MapPin },
          { label: 'Avg per trip', value: avgKm.toFixed(1) + ' km', icon: Clock },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="rounded-xl p-2.5 bg-orange-50 text-[var(--accent,#f97316)]">
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {([['gps', 'GPS Trip Log'], ['logbook', 'Vehicle Logbook']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-[var(--accent,#f97316)] text-[var(--accent,#f97316)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'gps' && (
        <div className="space-y-4">
          {byDay.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Route className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No GPS trips recorded in this date range</p>
              <p className="text-xs mt-1 text-gray-300">Auto-tracking must be enabled on the mobile app</p>
            </div>
          )}
          {byDay.map(({ date, logs: dayLogs }) => (
            <div key={date}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {formatDate(date + 'T00:00:00', timezone)} · {dayLogs.length} trip{dayLogs.length !== 1 ? 's' : ''} · {dayLogs.reduce((s, l) => s + (l.distance_km ?? 0), 0).toFixed(1)} km
              </p>
              <Card>
                <div className="divide-y divide-gray-50">
                  {dayLogs.map(l => {
                    const member = l.profile_id ? teamById[l.profile_id] : null
                    const startLink = mapsLink(l.start_lat, l.start_lng)
                    const endLink = mapsLink(l.end_lat, l.end_lng)
                    const movingMins = l.started_at && l.ended_at
                      ? Math.round((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 60000)
                      : null
                    return (
                      <div key={l.id} className="px-5 py-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {member && (
                              <span className="text-xs font-semibold text-gray-700">{member.full_name}</span>
                            )}
                            {member?.vehicle_registration && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{member.vehicle_registration}</span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${purposeColor[l.purpose ?? ''] ?? 'bg-orange-50 text-orange-600'}`}>
                              {l.purpose ? (PURPOSE_LABELS[l.purpose] ?? l.purpose) : 'Unallocated'}
                            </span>
                            {l.jobs && (
                              <span className="text-xs text-blue-600">{l.jobs.job_number}</span>
                            )}
                            {l.is_auto && (
                              verifiedIds.has(l.id)
                                ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />Verified</span>
                                : <button
                                    onClick={() => verifyTrip(l.id)}
                                    disabled={verifying === l.id}
                                    className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700"
                                  >
                                    <Circle className="h-3 w-3" />{verifying === l.id ? 'Verifying…' : 'Verify'}
                                  </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">
                            {formatTime(l.started_at, timezone)}
                            {l.ended_at && ` — ${formatTime(l.ended_at, timezone)}`}
                            {movingMins !== null && ` · ${Math.floor(movingMins / 60)}h ${movingMins % 60}m`}
                          </p>
                          {l.notes && <p className="text-xs text-gray-400 mt-0.5">{l.notes}</p>}
                          {!l.purpose && (
                            allocatingId === l.id ? (
                              <div className="flex flex-wrap items-center gap-2 mt-2 p-2 rounded-lg bg-orange-50 border border-orange-100">
                                <select
                                  value={draftPurpose}
                                  onChange={e => setDraftPurpose(e.target.value as 'work' | 'personal' | 'ignore')}
                                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                                >
                                  <option value="work">Work</option>
                                  <option value="personal">Personal</option>
                                  <option value="ignore">Ignore</option>
                                </select>
                                {draftPurpose === 'work' && (
                                  <select
                                    value={draftJobId}
                                    onChange={e => setDraftJobId(e.target.value)}
                                    className="rounded border border-gray-300 px-2 py-1 text-xs max-w-[220px]"
                                  >
                                    <option value="">Select job…</option>
                                    {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.title}</option>)}
                                  </select>
                                )}
                                <button
                                  onClick={() => allocate(l.id, draftPurpose, draftPurpose === 'work' ? (draftJobId || null) : null)}
                                  disabled={(draftPurpose === 'work' && !draftJobId) || allocSavingId === l.id}
                                  className="text-xs font-semibold text-white bg-[var(--accent,#f97316)] rounded px-2 py-1 disabled:opacity-50"
                                >
                                  {allocSavingId === l.id ? 'Saving…' : 'Save'}
                                </button>
                                <button onClick={() => setAllocatingId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startAllocating(l.id)}
                                className="text-xs font-medium text-orange-500 hover:text-orange-700 mt-1"
                              >
                                Allocate trip →
                              </button>
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-right shrink-0">
                          <div>
                            <p className="text-lg font-bold text-gray-900">{(l.distance_km ?? 0).toFixed(1)}</p>
                            <p className="text-xs text-gray-400">km</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            {startLink && (
                              <a href={startLink} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Start
                              </a>
                            )}
                            {endLink && (
                              <a href={endLink} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> End
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      {tab === 'logbook' && (
        <div>
          <p className="text-xs text-gray-400 mb-4">
            Vehicle logbook — filtered trips only. Export to CSV for accounting/tax purposes.
            Work trips shown below; use the GPS tab to reclassify unallocated trips.
          </p>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Driver</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Vehicle</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Start</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">End</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Distance</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Purpose</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Job</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {localLogs.filter(l => l.purpose === 'work' || !l.purpose).map((l, i) => {
                    const member = l.profile_id ? teamById[l.profile_id] : null
                    return (
                      <tr key={l.id} className={i > 0 ? 'border-t border-gray-50' : ''}>
                        <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{formatDate(l.started_at, timezone)}</td>
                        <td className="px-4 py-2 text-gray-700">{member?.full_name ?? '—'}</td>
                        <td className="px-4 py-2 font-mono text-gray-500 text-xs">{member?.vehicle_registration ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{formatTime(l.started_at, timezone)}</td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{l.ended_at ? formatTime(l.ended_at, timezone) : '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{(l.distance_km ?? 0).toFixed(2)} km</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${purposeColor[l.purpose ?? ''] ?? 'bg-orange-50 text-orange-600'}`}>
                            {l.purpose ? (PURPOSE_LABELS[l.purpose] ?? l.purpose) : 'Unallocated'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{l.jobs ? `${l.jobs.job_number}` : '—'}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs max-w-[160px] truncate">{l.notes ?? ''}</td>
                      </tr>
                    )
                  })}
                  {localLogs.filter(l => l.purpose === 'work' || !l.purpose).length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">No trips in this date range</td></tr>
                  )}
                </tbody>
                {localLogs.filter(l => l.purpose === 'work').length > 0 && (
                  <tfoot className="border-t border-gray-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Total work km:</td>
                      <td className="px-4 py-2 text-right font-bold text-gray-900">
                        {localLogs.filter(l => l.purpose === 'work').reduce((s, l) => s + (l.distance_km ?? 0), 0).toFixed(2)} km
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={() => downloadCSV(localLogs.filter(l => l.purpose === 'work' || !l.purpose), team, timezone)}>
              <Download className="h-4 w-4" /> Export logbook CSV
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
