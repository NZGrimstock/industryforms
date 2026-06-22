'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { MapPin, Loader2, AlertCircle, Phone, User } from 'lucide-react'
import { geocodeAddress } from '@/lib/geocode'

type MapJob = {
  id: string
  job_number: string
  title: string
  status: string
  assigned_to: string | null
  assignee_name: string | null
  customer_name: string
  customer_phone: string | null
  address: string
  site_label: string | null
  lat: number | null
  lng: number | null
}

type GeoJob = Omit<MapJob, 'lat' | 'lng'> & { lat: number; lng: number }
type TeamMember = { id: string; full_name: string }

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f97316',
  unscheduled: '#6b7280',
}

export function JobMap({ jobs, team }: { jobs: MapJob[]; team: TeamMember[] }) {
  const [geoJobs, setGeoJobs] = useState<GeoJob[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GeoJob | null>(null)
  const [assignee, setAssignee] = useState<string>('all')
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<import('leaflet').Map | null>(null)

  // Resolve coordinates: use stored lat/lng (geocoded once on save); only fall back
  // to live geocoding for the few sites that don't have coordinates yet.
  useEffect(() => {
    if (!jobs.length) { setGeoJobs([]); setLoading(false); return }
    const ready: GeoJob[] = jobs
      .filter(j => j.lat != null && j.lng != null)
      .map(j => ({ ...j, lat: j.lat as number, lng: j.lng as number }))
    const missing = jobs.filter(j => j.lat == null || j.lng == null)
    if (missing.length === 0) { setGeoJobs(ready); setLoading(false); return }

    let cancelled = false
    ;(async () => {
      const results = [...ready]
      for (const job of missing) {
        const coords = await geocodeAddress(job.address)
        if (coords) results.push({ ...job, lat: coords.lat, lng: coords.lng })
        await new Promise(r => setTimeout(r, 200))
      }
      if (!cancelled) { setGeoJobs(results); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [jobs])

  function matches(j: { assigned_to: string | null }) {
    if (assignee === 'all') return true
    if (assignee === 'unassigned') return j.assigned_to == null
    return j.assigned_to === assignee
  }

  const filteredJobs = useMemo(() => jobs.filter(matches), [jobs, assignee])
  const filteredGeoJobs = useMemo(() => geoJobs.filter(matches), [geoJobs, assignee])

  // (Re)draw the map + markers for the current filter.
  useEffect(() => {
    if (loading || !mapRef.current) return

    let cancelled = false
    async function initMap() {
      const L = (await import('leaflet')).default
      if (cancelled || !mapRef.current) return

      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null }

      const center: [number, number] = filteredGeoJobs.length > 0
        ? [filteredGeoJobs.reduce((s, j) => s + j.lat, 0) / filteredGeoJobs.length, filteredGeoJobs.reduce((s, j) => s + j.lng, 0) / filteredGeoJobs.length]
        : [-41.0, 173.0] // NZ-ish default

      const map = L.map(mapRef.current!).setView(center, filteredGeoJobs.length ? 12 : 5)
      leafletMap.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      for (const job of filteredGeoJobs) {
        const color = STATUS_COLORS[job.status] ?? '#6b7280'
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        })
        const marker = L.marker([job.lat, job.lng], { icon }).addTo(map)
        marker.on('click', () => setSelected(job))
      }

      if (filteredGeoJobs.length > 1) {
        const bounds = L.latLngBounds(filteredGeoJobs.map(j => [j.lat, j.lng] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      }
    }

    initMap()
    return () => {
      cancelled = true
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null }
    }
  }, [loading, filteredGeoJobs])

  const statusLabel: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    unscheduled: 'Unscheduled',
  }
  const locatedMissing = filteredJobs.length - filteredGeoJobs.length

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-gray-100 overflow-y-auto bg-white">
        <div className="p-4 border-b border-gray-100 space-y-3">
          {/* Team member filter */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><User className="h-3 w-3" /> Show jobs for</label>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400"
            >
              <option value="all">All team members</option>
              <option value="unassigned">Unassigned</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">{filteredJobs.length} active job{filteredJobs.length !== 1 ? 's' : ''}</p>
            {loading && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Locating addresses…</p>}
            {!loading && filteredJobs.length > 0 && locatedMissing > 0 && (
              <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{locatedMissing} address{locatedMissing !== 1 ? 'es' : ''} could not be located</p>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {filteredJobs.map(job => {
            const located = geoJobs.find(g => g.id === job.id)
            const isSelected = selected?.id === job.id
            return (
              <button
                key={job.id}
                onClick={() => {
                  if (located) {
                    setSelected(located)
                    leafletMap.current?.flyTo([located.lat, located.lng], 15)
                  }
                }}
                className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-orange-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-orange-500">{job.job_number}</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                    <p className="text-xs text-gray-500 truncate">{job.customer_name}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-0.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {job.site_label ? `${job.site_label} — ` : ''}{job.address}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-0.5">
                      <User className="h-3 w-3 flex-shrink-0" />{job.assignee_name ?? 'Unassigned'}
                    </p>
                  </div>
                  <span
                    className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0"
                    style={{ background: (STATUS_COLORS[job.status] ?? '#6b7280') + '20', color: STATUS_COLORS[job.status] ?? '#6b7280' }}
                  >
                    {statusLabel[job.status] ?? job.status}
                  </span>
                </div>
                {!located && !loading && (
                  <p className="text-xs text-gray-400 mt-1 italic">Address not found on map</p>
                )}
              </button>
            )
          })}

          {filteredJobs.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              No active jobs{assignee !== 'all' ? ' for this filter' : ' with site addresses'}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading job locations…</p>
            </div>
          </div>
        )}

        {!loading && filteredGeoJobs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50">
            <div className="text-center text-gray-400">
              <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No jobs to show on the map</p>
              <p className="text-xs mt-1">{assignee !== 'all' ? 'Try “All team members”' : 'Ensure job sites have valid addresses'}</p>
            </div>
          </div>
        )}

        {/* Selected job popup */}
        {selected && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-white rounded-xl shadow-lg border border-gray-200 p-4 w-80">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-orange-500 mb-0.5">{selected.job_number}</p>
                <p className="text-sm font-semibold text-gray-900">{selected.title}</p>
                <p className="text-xs text-gray-500">{selected.customer_name}</p>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{selected.address}
                </p>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <User className="h-3 w-3" />{selected.assignee_name ?? 'Unassigned'}
                </p>
                {selected.customer_phone && (
                  <p className="text-xs mt-1 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    <a href={`tel:${selected.customer_phone.replace(/[^+\d]/g, '')}`} className="text-orange-500 hover:text-[var(--accent,#f97316)] font-medium">
                      {selected.customer_phone}
                    </a>
                  </p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {selected.customer_phone && (
                <a
                  href={`tel:${selected.customer_phone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-medium"
                >
                  <Phone className="h-3.5 w-3.5" /> Call customer
                </a>
              )}
              <Link href={`/jobs/${selected.id}`} className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium">
                Open job →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
