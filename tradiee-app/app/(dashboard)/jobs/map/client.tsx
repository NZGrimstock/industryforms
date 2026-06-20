'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { MapPin, Loader2, AlertCircle, Phone } from 'lucide-react'

type MapJob = {
  id: string
  job_number: string
  title: string
  status: string
  customer_name: string
  customer_phone: string | null
  address: string
  site_label: string | null
}

type GeoJob = MapJob & { lat: number; lng: number }

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f97316',
  unscheduled: '#6b7280',
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(address)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'IndustryForms-App/1.0' },
    })
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {}
  return null
}

export function JobMap({ jobs }: { jobs: MapJob[] }) {
  const [geoJobs, setGeoJobs] = useState<GeoJob[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GeoJob | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<import('leaflet').Map | null>(null)
  const markersRef = useRef<import('leaflet').Marker[]>([])

  useEffect(() => {
    if (!jobs.length) { setLoading(false); return }

    async function geocodeAll() {
      const results: GeoJob[] = []
      for (const job of jobs) {
        const coords = await geocode(job.address)
        if (coords) results.push({ ...job, ...coords })
        await new Promise(r => setTimeout(r, 200))
      }
      setGeoJobs(results)
      setLoading(false)
    }

    geocodeAll()
  }, [jobs])

  useEffect(() => {
    if (loading || !mapRef.current || geoJobs.length === 0) return

    async function initMap() {
      const L = (await import('leaflet')).default

      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
        markersRef.current = []
      }

      const center: [number, number] = geoJobs.length > 0
        ? [geoJobs.reduce((s, j) => s + j.lat, 0) / geoJobs.length, geoJobs.reduce((s, j) => s + j.lng, 0) / geoJobs.length]
        : [-36.8485, 174.7633]

      const map = L.map(mapRef.current!).setView(center, 12)
      leafletMap.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      for (const job of geoJobs) {
        const color = STATUS_COLORS[job.status] ?? '#6b7280'
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        })
        const marker = L.marker([job.lat, job.lng], { icon }).addTo(map)
        marker.on('click', () => setSelected(job))
        markersRef.current.push(marker)
      }

      if (geoJobs.length > 1) {
        const bounds = L.latLngBounds(geoJobs.map(j => [j.lat, j.lng] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    }

    initMap()

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove()
        leafletMap.current = null
      }
    }
  }, [loading, geoJobs])

  const statusLabel: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    unscheduled: 'Unscheduled',
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-gray-100 overflow-y-auto bg-white">
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700">{jobs.length} active jobs</p>
          {loading && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Geocoding addresses…</p>}
          {!loading && jobs.length > 0 && geoJobs.length < jobs.length && (
            <p className="text-xs text-orange-500 mt-0.5 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{jobs.length - geoJobs.length} address{jobs.length - geoJobs.length !== 1 ? 'es' : ''} could not be located</p>
          )}
        </div>

        <div className="divide-y divide-gray-50">
          {jobs.map(job => {
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

          {jobs.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              No active jobs with site addresses
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

        {!loading && geoJobs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50">
            <div className="text-center text-gray-400">
              <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No jobs could be located on the map</p>
              <p className="text-xs mt-1">Ensure job sites have valid addresses</p>
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
                {selected.customer_phone && (
                  <p className="text-xs mt-1 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    <a href={`tel:${selected.customer_phone.replace(/[^+\d]/g, '')}`} className="text-orange-500 hover:text-orange-600 font-medium">
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
