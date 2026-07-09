import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { useQuery } from '@powersync/react'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow } from '@/lib/theme'
import { ACTIVE_ETA_KEY } from '@/lib/location/tracking'
import { success as hapticSuccess } from '@/lib/haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

type Job = {
  id: string
  job_number: string
  customer_id: string | null
  customer_name: string | null
  site_lat: number | null
  site_lng: number | null
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again.')
  return { Authorization: `Bearer ${session.access_token}` }
}

export default function OnMyWayScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>()

  const { data: jobs, isLoading: jobLoading } = useQuery<Job>(
    `SELECT j.id, j.job_number, j.customer_id, c.name AS customer_name, s.lat AS site_lat, s.lng AS site_lng
     FROM jobs j
     LEFT JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_sites s ON s.id = j.site_id
     WHERE j.id = ?`,
    [jobId]
  )
  const job = jobs?.[0]

  const [locating, setLocating] = useState(true)
  const [eta, setEta] = useState<{ minutes: number; km: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [status, setStatus] = useState<'on_way' | 'running_late' | 'arrived'>('on_way')
  const [sentMessage, setSentMessage] = useState<string | null>(null)

  const calcEta = useCallback(async () => {
    if (!job?.site_lat || !job?.site_lng) { setLocating(false); setError('This job has no site location set.'); return }
    setLocating(true)
    setError(null)
    try {
      const perm = await Location.requestForegroundPermissionsAsync()
      if (perm.status !== 'granted') throw new Error('Location permission needed for ETA.')
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const res = await fetch(`${API_BASE}/api/eta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          fromLat: pos.coords.latitude, fromLng: pos.coords.longitude,
          toLat: job.site_lat, toLng: job.site_lng,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not calculate ETA')
      setEta({ minutes: data.etaMinutes, km: data.distanceKm })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get your location')
    }
    setLocating(false)
  }, [job?.site_lat, job?.site_lng])

  useEffect(() => { if (job) calcEta() }, [job, calcEta])

  async function send(nextStatus: 'on_way' | 'running_late' | 'arrived') {
    if (!jobId) return
    setSending(nextStatus)
    try {
      const res = await fetch(`${API_BASE}/api/sms/eta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          jobId, status: nextStatus,
          etaMinutes: nextStatus === 'running_late' ? (eta?.minutes ?? 0) + 15 : eta?.minutes,
          distanceKm: eta?.km,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send')
      hapticSuccess()
      setStatus(nextStatus)
      setSentMessage(data.body)
      if (nextStatus === 'arrived') {
        await AsyncStorage.removeItem(ACTIVE_ETA_KEY)
      } else if (job?.customer_id) {
        await AsyncStorage.setItem(ACTIVE_ETA_KEY, JSON.stringify({ jobId, customerId: job.customer_id, sentAt: new Date().toISOString() }))
      }
      Alert.alert('Sent', nextStatus === 'arrived' ? "Customer notified you've arrived." : 'Customer notified.', [{ text: 'OK', onPress: () => router.back() }])
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Unknown error')
    }
    setSending(null)
  }

  if (jobLoading || !job) {
    return <SafeAreaView style={s.container}><ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} /></SafeAreaView>
  }

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'On my way', headerTintColor: colors.brand, headerShown: true }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={s.hero}>
          {locating ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : error ? (
            <Text style={s.heroError}>{error}</Text>
          ) : (
            <>
              <Text style={s.heroBig}>{eta?.minutes}</Text>
              <Text style={s.heroLabel}>minutes away · {eta?.km} km</Text>
            </>
          )}
        </View>

        {!locating && !error && (
          <>
            <View style={s.preview}>
              <Text style={s.previewText}>
                Hi <Text style={s.bold}>{(job.customer_name ?? 'there').split(' ')[0]}</Text>, on my way — ETA about{' '}
                <Text style={s.bold}>{eta?.minutes} min</Text>.
              </Text>
              {sentMessage && <Text style={s.sentHint}>Last sent: “{sentMessage}”</Text>}
            </View>

            <Text style={s.qhead}>Or pick another update</Text>
            <View style={s.chips}>
              <TouchableOpacity style={s.chip} onPress={() => send('running_late')} disabled={!!sending}>
                <Text style={s.chipText}>{'⏰'} Running late</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.chip} onPress={() => send('arrived')} disabled={!!sending}>
                <Text style={s.chipText}>{'\u{1F4CD}'} I've arrived</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.sendBtn, sending && { opacity: 0.6 }]}
              onPress={() => send('on_way')}
              disabled={!!sending}
              activeOpacity={0.85}
            >
              {sending === 'on_way'
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.sendBtnText}>Send &quot;On my way&quot; →</Text>}
            </TouchableOpacity>
            <Text style={s.hint}>Sends by email now; SMS once Twilio is enabled. Arrival is auto-detected when you're on-site.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.brand, paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
  heroBig: { fontSize: 56, fontWeight: '800', color: '#fff', lineHeight: 58 },
  heroLabel: { fontSize: 13, color: '#fff', opacity: 0.95, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  heroError: { color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  preview: { margin: 16, backgroundColor: colors.brandBg, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: radius.lg, padding: 14 },
  previewText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  bold: { fontWeight: '800', color: colors.brandDark },
  sentHint: { fontSize: 11, color: colors.sub, marginTop: 8, fontStyle: 'italic' },
  qhead: { fontSize: 11, fontWeight: '800', color: colors.mut, textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, ...shadow.card },
  chipText: { fontWeight: '600', fontSize: 13, color: colors.ink },
  sendBtn: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: 16, alignItems: 'center', marginHorizontal: 16, marginTop: 16 },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  hint: { textAlign: 'center', color: colors.mut, fontSize: 11, marginTop: 10, marginHorizontal: 24 },
})
