import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Linking, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { getJobStatuses } from '@/lib/job-statuses'

type MapJob = {
  id: string
  job_number: string
  title: string
  status: string
  lat: number
  lng: number
  address: string | null
  customer: string | null
  phone: string | null
}

function hasCoords(j: MapJob) {
  return Number.isFinite(j.lat) && Number.isFinite(j.lng)
}

function buildHtml(jobs: MapJob[]) {
  const located = jobs.filter(hasCoords)
  const pts = JSON.stringify(located.map((j, i) => ({ lat: j.lat, lng: j.lng, label: `${i + 1}. ${j.job_number} — ${j.title}` })))
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var pts = ${pts};
  var map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  if (pts.length) {
    var markers = pts.map(function(p, i){ return L.marker([p.lat, p.lng]).bindPopup(p.label); });
    var group = L.featureGroup(markers).addTo(map);
    map.fitBounds(group.getBounds().pad(0.25));
  } else {
    map.setView([-41, 174], 5);
  }
</script></body></html>`
}

export default function MapScreen() {
  const [jobs, setJobs] = useState<MapJob[]>([])
  const [loading, setLoading] = useState(true)
  const [mine, setMine] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }

    // "Active" = any non-terminal status (respects the company's custom statuses).
    const statuses = await getJobStatuses(profile.company_id)
    const activeKeys = statuses.filter(s => !s.is_terminal).map(s => s.key)

    let q = supabase
      .from('jobs')
      .select('id, job_number, title, status, assigned_to, customer_sites!site_id(lat, lng, address), customers(name, phone)')
      .eq('company_id', profile.company_id)
      .in('status', activeKeys)
    if (mine) q = q.eq('assigned_to', user.id)
    const { data } = await q.limit(200)

    const all: MapJob[] = (data ?? []).map(j => {
      const site = (Array.isArray(j.customer_sites) ? j.customer_sites[0] : j.customer_sites) as { lat: number | null; lng: number | null; address: string | null } | null
      const cust = (Array.isArray(j.customers) ? j.customers[0] : j.customers) as { name: string | null; phone: string | null } | null
      return {
        id: j.id, job_number: j.job_number, title: j.title, status: j.status,
        lat: site?.lat ?? NaN, lng: site?.lng ?? NaN, address: site?.address ?? null,
        customer: cust?.name ?? null, phone: cust?.phone ?? null,
      }
    })
    // Located jobs first (they get map pins + numbers), then the rest.
    all.sort((a, b) => (hasCoords(b) ? 1 : 0) - (hasCoords(a) ? 1 : 0))
    setJobs(all)
    setLoading(false)
  }, [mine])

  useFocusEffect(useCallback(() => { load() }, [load]))
  useEffect(() => { load() }, [load])

  function call(phone: string) {
    Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => {})
  }
  function directions(j: MapJob) {
    const label = encodeURIComponent(j.address ?? j.title)
    let url: string
    if (hasCoords(j)) {
      url = Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${j.lat},${j.lng}&q=${label}`
        : `geo:${j.lat},${j.lng}?q=${j.lat},${j.lng}(${label})`
    } else {
      // No stored coordinates — let the maps app geocode the address string.
      url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${label}` : `geo:0,0?q=${label}`
    }
    Linking.openURL(url).catch(() => {})
  }

  const mapNumbers = new Map(jobs.filter(hasCoords).map((j, i) => [j.id, i + 1]))
  const locatedCount = mapNumbers.size

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.toggleRow}>
        <TouchableOpacity onPress={() => setMine(true)} style={[styles.toggle, mine && styles.toggleOn]}>
          <Text style={[styles.toggleText, mine && styles.toggleTextOn]}>My jobs</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMine(false)} style={[styles.toggle, !mine && styles.toggleOn]}>
          <Text style={[styles.toggleText, !mine && styles.toggleTextOn]}>All jobs</Text>
        </TouchableOpacity>
        <Text style={styles.count}>{locatedCount} on map{jobs.length > locatedCount ? ` · ${jobs.length - locatedCount} not located` : ''}</Text>
      </View>

      <View style={styles.mapBox}>
        {loading
          ? <View style={styles.center}><ActivityIndicator color="#f97316" /></View>
          : <WebView originWhitelist={['*']} source={{ html: buildHtml(jobs) }} style={{ flex: 1 }} />}
      </View>

      <FlatList
        data={jobs}
        keyExtractor={j => j.id}
        style={styles.list}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={!loading ? (
          <Text style={styles.empty}>No active jobs to show.</Text>
        ) : null}
        renderItem={({ item }) => {
          const num = mapNumbers.get(item.id)
          return (
            <View style={[styles.card, !num && styles.cardUnlocated]}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/jobs/${item.id}`)}>
                <View style={styles.cardNumRow}>
                  {num
                    ? <Text style={styles.cardNum}>{num}. {item.job_number}</Text>
                    : <><Text style={styles.cardNum}>{item.job_number}</Text><Text style={styles.notOnMap}>Not on map</Text></>}
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                {item.address
                  ? <Text style={styles.cardAddr} numberOfLines={1}>{item.address}</Text>
                  : <Text style={[styles.cardAddr, { color: '#d1d5db' }]}>No site address</Text>}
              </TouchableOpacity>
              <View style={styles.actions}>
                {item.phone ? (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => call(item.phone!)}>
                    <Text style={styles.actionText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
                {(hasCoords(item) || item.address) ? (
                  <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => directions(item)}>
                    <Text style={[styles.actionText, styles.actionTextPrimary]}>Directions</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  toggle: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, backgroundColor: '#f3f4f6' },
  toggleOn: { backgroundColor: '#f97316' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextOn: { color: '#fff' },
  count: { marginLeft: 'auto', fontSize: 12, color: '#9ca3af' },
  mapBox: { height: 280, marginHorizontal: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: '#e5e7eb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardUnlocated: { backgroundColor: '#fafafa' },
  cardNumRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardNum: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  notOnMap: { fontSize: 10, fontWeight: '600', color: '#9ca3af', backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardAddr: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6' },
  actionPrimary: { backgroundColor: '#fff7ed' },
  actionText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  actionTextPrimary: { color: '#f97316' },
})
