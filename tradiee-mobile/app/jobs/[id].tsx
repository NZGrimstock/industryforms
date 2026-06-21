import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Image, Linking, Platform,
} from 'react-native'
import { useLocalSearchParams, router, Stack, useFocusEffect } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { getJobStatuses, resolveStatus, statusHex, DEFAULT_JOB_STATUSES, type JobStatus } from '@/lib/job-statuses'

const ACTIVE_JOB_KEY = 'TRADIEE_ACTIVE_JOB'
type ActiveJob = { jobId: string; timesheetId: string; startedAt: string }

// Visit statuses are a fixed enum (not the company's custom job statuses).
const VISIT_STATUS_COLOR: Record<string, string> = {
  unscheduled: '#6b7280',
  scheduled:   '#3b82f6',
  in_progress: '#f97316',
  on_hold:     '#eab308',
  completed:   '#22c55e',
  cancelled:   '#ef4444',
}

type Job = {
  id: string
  job_number: string
  title: string
  description: string | null
  status: string
  customer_name: string | null
  customer_phone: string | null
  customer_billing_address: string | null
  site_address: string | null
  site_lat: number | null
  site_lng: number | null
  assigned_to: string | null
  created_at: string
}

type Note = { id: string; body: string; author_id: string | null; created_at: string }
type Material = { id: string; description: string; quantity: number; unit: string | null; unit_price: number }
type Visit = { id: string; scheduled_start: string; scheduled_end: string | null; status: string }
type Photo = { id: string; storage_path: string; caption: string | null; taken_at: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [togglingTimer, setTogglingTimer] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [statuses, setStatuses] = useState<JobStatus[]>(DEFAULT_JOB_STATUSES)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('company_id').eq('id', user.id).single()
        .then(({ data: profile }) => {
          if (profile?.company_id) getJobStatuses(profile.company_id).then(setStatuses)
        })
    })
  }, [])

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(ACTIVE_JOB_KEY).then(raw => {
      const aj: ActiveJob | null = raw ? JSON.parse(raw) : null
      setActiveJob(aj?.jobId === id ? aj : null)
    })
  }, [id]))

  useEffect(() => {
    if (!activeJob) { setElapsed(''); return }
    const tick = () => {
      const mins = Math.round((Date.now() - new Date(activeJob.startedAt).getTime()) / 60000)
      setElapsed(`${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [activeJob])

  async function startJob() {
    setTogglingTimer(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setTogglingTimer(false); return }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('timesheets').insert({
      job_id: id, profile_id: user.id, company_id: profile?.company_id,
      started_at: now, is_billable: true,
    }).select('id').single()
    if (error) { Alert.alert('Error', error.message); setTogglingTimer(false); return }
    const aj: ActiveJob = { jobId: id!, timesheetId: data.id, startedAt: now }
    await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(aj))
    setActiveJob(aj)
    setTogglingTimer(false)
  }

  async function stopJob() {
    if (!activeJob) return
    setTogglingTimer(true)
    const { error } = await supabase.from('timesheets')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeJob.timesheetId)
    if (error) { Alert.alert('Error', error.message); setTogglingTimer(false); return }
    await AsyncStorage.removeItem(ACTIVE_JOB_KEY)
    setActiveJob(null)
    setTogglingTimer(false)
  }

  const { data: jobs, isLoading } = useQuery<Job>(
    `SELECT j.id, j.job_number, j.title, j.description, j.status, j.assigned_to, j.created_at,
            c.name AS customer_name, c.phone AS customer_phone,
            c.billing_address AS customer_billing_address,
            s.address AS site_address, s.lat AS site_lat, s.lng AS site_lng
     FROM jobs j
     LEFT JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_sites s ON s.id = j.site_id
     WHERE j.id = ?`,
    [id]
  )
  const job = jobs?.[0]
  const jobAddress = job?.site_address ?? job?.customer_billing_address ?? null

  function callPhone(phone: string) {
    Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() =>
      Alert.alert('Could not place call', phone)
    )
  }

  function openInMaps() {
    // Prefer exact coordinates when geocoded; otherwise hand the address string to
    // the platform's default maps app (Apple Maps on iOS, Google Maps on Android).
    const hasCoords = job?.site_lat != null && job?.site_lng != null
    const label = encodeURIComponent(jobAddress ?? job?.customer_name ?? 'Job')
    let url: string
    if (Platform.OS === 'ios') {
      url = hasCoords
        ? `http://maps.apple.com/?ll=${job!.site_lat},${job!.site_lng}&q=${label}`
        : `http://maps.apple.com/?q=${encodeURIComponent(jobAddress ?? '')}`
    } else {
      url = hasCoords
        ? `geo:${job!.site_lat},${job!.site_lng}?q=${job!.site_lat},${job!.site_lng}(${label})`
        : `geo:0,0?q=${encodeURIComponent(jobAddress ?? '')}`
    }
    Linking.openURL(url).catch(() => Alert.alert('Could not open maps', jobAddress ?? ''))
  }

  const { data: notes } = useQuery<Note>(
    `SELECT id, body, author_id, created_at FROM job_notes
     WHERE job_id = ? ORDER BY created_at DESC`,
    [id]
  )

  const { data: materials } = useQuery<Material>(
    `SELECT id, description, quantity, unit, unit_price
     FROM job_materials WHERE job_id = ?
     ORDER BY rowid ASC`,
    [id]
  )

  const { data: visits } = useQuery<Visit>(
    `SELECT id, scheduled_start, scheduled_end, status
     FROM job_visits WHERE job_id = ?
     ORDER BY scheduled_start ASC`,
    [id]
  )

  const { data: photos } = useQuery<Photo>(
    `SELECT id, storage_path, caption, taken_at FROM job_photos
     WHERE job_id = ? ORDER BY taken_at ASC`,
    [id]
  )

  useEffect(() => {
    if (!photos?.length) return
    // Job photos live in the public R2 bucket — build the URL from the key.
    const base = (process.env.EXPO_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
    setPhotoUrls(prev => {
      const next = { ...prev }
      photos.forEach(p => { if (!next[p.id]) next[p.id] = `${base}/${p.storage_path}` })
      return next
    })
  }, [photos])

  async function addPhoto(source: 'camera' | 'gallery') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', `Please allow ${source} access in Settings.`)
      return
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: false, mediaTypes: ImagePicker.MediaTypeOptions.Images })
    if (result.canceled || !result.assets[0]) return

    setUploadingPhoto(true)
    try {
      const asset = result.assets[0]
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase()
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`

      // Get a presigned R2 upload URL from the web API (bearer-authenticated)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const signRes = await fetch(`${apiBase}/api/storage/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind: 'job-photo', jobId: id, ext, contentType }),
      })
      if (!signRes.ok) throw new Error((await signRes.json()).error ?? 'Could not get upload URL')
      const { url, key } = await signRes.json()

      const resp = await fetch(asset.uri)
      const blob = await resp.blob()
      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob })
      if (!put.ok) throw new Error('Upload to storage failed')

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      await supabase.from('job_photos').insert({
        job_id: id, uploaded_by: session.user.id, company_id: profile?.company_id,
        storage_path: key, taken_at: new Date().toISOString(),
      })
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  function promptPhotoSource() {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Camera', onPress: () => addPhoto('camera') },
      { text: 'Photo Library', onPress: () => addPhoto('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('job_notes').insert({
      job_id: id,
      author_id: user?.id,
      body: noteText.trim(),
    })
    setSavingNote(false)
    if (error) { Alert.alert('Error', error.message); return }
    setNoteText('')
    setShowAddNote(false)
  }

  async function updateStatus(newStatus: string) {
    setUpdatingStatus(true)
    setShowStatusPicker(false)
    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', id)
    setUpdatingStatus(false)
    if (error) Alert.alert('Error', error.message)
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  if (!job) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9ca3af' }}>Job not found</Text>
      </View>
    )
  }

  const otherStatuses = statuses.filter(s => s.key !== job.status)
  const current = resolveStatus(statuses, job.status)
  const materialsTotal = (materials ?? []).reduce((sum, m) => sum + m.quantity * m.unit_price, 0)

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <Stack.Screen options={{ title: job.job_number, headerTintColor: '#f97316' }} />
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobNumber}>{job.job_number}</Text>
              <Text style={styles.title}>{job.title}</Text>
            </View>
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: current.hex + '20' }]}
              onPress={() => otherStatuses.length > 0 && setShowStatusPicker(true)}
              activeOpacity={otherStatuses.length > 0 ? 0.7 : 1}
            >
              {updatingStatus
                ? <ActivityIndicator size="small" color={current.hex} />
                : <Text style={[styles.statusText, { color: current.hex }]}>{current.label}</Text>
              }
            </TouchableOpacity>
          </View>

          {job.description && (
            <Text style={styles.description}>{job.description}</Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Customer</Text>
            <Text style={styles.metaValue}>{job.customer_name ?? '—'}</Text>
          </View>
          {job.customer_phone && (
            <TouchableOpacity style={styles.metaRow} onPress={() => callPhone(job.customer_phone!)} activeOpacity={0.6}>
              <Text style={styles.metaLabel}>Phone</Text>
              <Text style={[styles.metaValue, styles.metaLink]}>{job.customer_phone}</Text>
            </TouchableOpacity>
          )}
          {jobAddress && (
            <TouchableOpacity style={styles.metaRow} onPress={openInMaps} activeOpacity={0.6}>
              <Text style={styles.metaLabel}>Address</Text>
              <Text style={[styles.metaValue, styles.metaLink]}>{jobAddress}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{formatDate(job.created_at)}</Text>
          </View>
        </View>

        {/* Visits */}
        {(visits ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visits</Text>
            {visits!.map(v => (
              <View key={v.id} style={styles.visitRow}>
                <View style={[styles.dot, { backgroundColor: VISIT_STATUS_COLOR[v.status] ?? '#9ca3af' }]} />
                <Text style={styles.visitText}>{formatDateTime(v.scheduled_start)}</Text>
                <View style={[styles.minibadge, { backgroundColor: (VISIT_STATUS_COLOR[v.status] ?? '#9ca3af') + '20' }]}>
                  <Text style={[styles.minibadgeText, { color: VISIT_STATUS_COLOR[v.status] ?? '#9ca3af' }]}>
                    {v.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Materials */}
        {(materials ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Materials</Text>
            {materials!.map(m => (
              <View key={m.id} style={styles.materialRow}>
                <Text style={styles.materialDesc} numberOfLines={1}>{m.description}</Text>
                <Text style={styles.materialQty}>{m.quantity}{m.unit ? ` ${m.unit}` : ''}</Text>
                <Text style={styles.materialPrice}>${(m.quantity * m.unit_price).toFixed(2)}</Text>
              </View>
            ))}
            <View style={styles.materialTotal}>
              <Text style={styles.materialTotalLabel}>Total</Text>
              <Text style={styles.materialTotalValue}>${materialsTotal.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Photos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <TouchableOpacity onPress={promptPhotoSource} disabled={uploadingPhoto}>
              <Text style={styles.addLink}>{uploadingPhoto ? 'Uploading…' : '+ Add'}</Text>
            </TouchableOpacity>
          </View>
          {(photos ?? []).length === 0 && !uploadingPhoto && (
            <Text style={styles.emptyText}>No photos yet</Text>
          )}
          {uploadingPhoto && (
            <ActivityIndicator color="#f97316" style={{ marginVertical: 8 }} />
          )}
          <View style={styles.photoGrid}>
            {(photos ?? []).map(p => (
              <View key={p.id} style={styles.photoThumb}>
                {photoUrls[p.id]
                  ? <Image source={{ uri: photoUrls[p.id] }} style={styles.photoImg} />
                  : <View style={[styles.photoImg, { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }]}>
                      <ActivityIndicator size="small" color="#d1d5db" />
                    </View>
                }
              </View>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TouchableOpacity onPress={() => setShowAddNote(true)}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {showAddNote && (
            <View style={styles.addNoteBox}>
              <TextInput
                style={styles.noteInput}
                multiline
                placeholder="Write a note…"
                placeholderTextColor="#9ca3af"
                value={noteText}
                onChangeText={setNoteText}
                autoFocus
              />
              <View style={styles.addNoteActions}>
                <TouchableOpacity onPress={() => setShowAddNote(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveNoteBtn, (!noteText.trim() || savingNote) && { opacity: 0.5 }]}
                  onPress={addNote}
                  disabled={!noteText.trim() || savingNote}
                >
                  <Text style={styles.saveNoteBtnText}>{savingNote ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(notes ?? []).length === 0 && !showAddNote && (
            <Text style={styles.emptyText}>No notes yet</Text>
          )}
          {(notes ?? []).map(note => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteBody}>{note.body}</Text>
              <Text style={styles.noteMeta}>
                {formatDateTime(note.created_at)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Fixed bottom timer button */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.bigTimerBtn, activeJob ? styles.bigTimerBtnStop : styles.bigTimerBtnStart]}
          onPress={activeJob ? stopJob : startJob}
          disabled={togglingTimer}
          activeOpacity={0.85}
        >
          {togglingTimer
            ? <ActivityIndicator color="#fff" size="large" />
            : <>
                <Text style={styles.bigTimerIcon}>{activeJob ? '⏹' : '▶'}</Text>
                <View>
                  <Text style={styles.bigTimerLabel}>
                    {activeJob ? 'Stop Job' : 'Start Job'}
                  </Text>
                  {activeJob && elapsed ? (
                    <Text style={styles.bigTimerElapsed}>{elapsed} elapsed</Text>
                  ) : null}
                </View>
              </>
          }
        </TouchableOpacity>
      </SafeAreaView>

      {/* Status picker modal */}
      <Modal visible={showStatusPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} onPress={() => setShowStatusPicker(false)} activeOpacity={1}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Update Status</Text>
            {otherStatuses.map(s => (
              <TouchableOpacity key={s.key} style={styles.pickerRow} onPress={() => updateStatus(s.key)}>
                <View style={[styles.dot, { backgroundColor: statusHex(s.color) }]} />
                <Text style={styles.pickerLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  headerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  jobNumber: { fontSize: 12, color: '#9ca3af', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statusBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', minWidth: 80, alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  metaLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', flex: 1, textAlign: 'right' },
  metaLink: { color: '#f97316', textDecorationLine: 'underline' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  addLink: { fontSize: 14, color: '#f97316', fontWeight: '600' },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  visitText: { flex: 1, fontSize: 14, color: '#374151' },
  minibadge: { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  minibadgeText: { fontSize: 11, fontWeight: '600' },
  materialRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  materialDesc: { flex: 1, fontSize: 14, color: '#374151' },
  materialQty: { fontSize: 13, color: '#6b7280', minWidth: 40, textAlign: 'right' },
  materialPrice: { fontSize: 14, fontWeight: '600', color: '#111827', minWidth: 64, textAlign: 'right' },
  materialTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  materialTotalLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  materialTotalValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  addNoteBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  noteInput: { fontSize: 15, color: '#111827', minHeight: 80, textAlignVertical: 'top' },
  addNoteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelText: { fontSize: 15, color: '#9ca3af', paddingVertical: 4 },
  saveNoteBtn: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  saveNoteBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  noteCard: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  noteBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  noteMeta: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  emptyText: { color: '#d1d5db', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  bottomBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  bigTimerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderRadius: 16, paddingVertical: 18 },
  bigTimerBtnStart: { backgroundColor: '#22c55e' },
  bigTimerBtnStop: { backgroundColor: '#ef4444' },
  bigTimerIcon: { fontSize: 28, color: '#fff' },
  bigTimerLabel: { fontSize: 20, fontWeight: '800', color: '#fff' },
  bigTimerElapsed: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  photoThumb: { borderRadius: 8, overflow: 'hidden' },
  photoImg: { width: 90, height: 90, borderRadius: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  picker: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  pickerLabel: { fontSize: 16, color: '#374151' },
})
