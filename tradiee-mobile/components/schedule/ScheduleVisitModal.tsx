import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ScrollView, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30)

function formatHalfHour(mins: number) {
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  const period = hh < 12 ? 'AM' : 'PM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${mm.toString().padStart(2, '0')} ${period}`
}

type Job = { id: string; job_number: string; title: string; status: string }
type Customer = { id: string; name: string }
type TeamMember = { id: string; full_name: string }
export type PresetJob = { id: string; job_number: string; title: string }

interface Props {
  visible: boolean
  initialDate: string // YYYY-MM-DD
  initialStartMin?: number // minutes since midnight
  presetJob?: PresetJob | null
  onClose: () => void
  onSaved: () => void
}

export function ScheduleVisitModal({ visible, initialDate, initialStartMin = 9 * 60, presetJob, onClose, onSaved }: Props) {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])

  const [mode, setMode] = useState<'existing' | 'new'>(presetJob ? 'existing' : 'existing')
  const [selectedJob, setSelectedJob] = useState<Job | null>(presetJob ? { ...presetJob, status: '' } : null)
  const [jobSearch, setJobSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')

  const [date, setDate] = useState(initialDate)
  const [startMin, setStartMin] = useState(initialStartMin)
  const [endMin, setEndMin] = useState(initialStartMin + 60)
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null)
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    setDate(initialDate)
    setStartMin(initialStartMin)
    setEndMin(initialStartMin + 60)
    setMode('existing')
    setSelectedJob(presetJob ? { ...presetJob, status: '' } : null)
    setJobSearch('')
    setNewTitle('')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setAssignedTo(null)
    setNotes('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialDate, initialStartMin])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('company_id').eq('id', user.id).single().then(({ data: profile }) => {
        if (!profile?.company_id) return
        setCompanyId(profile.company_id)
        Promise.all([
          supabase.from('jobs').select('id, job_number, title, status').eq('company_id', profile.company_id)
            .not('status', 'in', '(completed,cancelled)').order('created_at', { ascending: false }).limit(200),
          supabase.from('customers').select('id, name').eq('company_id', profile.company_id).eq('is_active', true).order('name').limit(300),
          supabase.from('profiles').select('id, full_name').eq('company_id', profile.company_id).eq('is_active', true).order('full_name'),
        ]).then(([jobsRes, customersRes, teamRes]) => {
          setJobs(jobsRes.data ?? [])
          setCustomers(customersRes.data ?? [])
          setTeam(teamRes.data ?? [])
        })
      })
    })
  }, [])

  const filteredJobs = jobs.filter(j =>
    j.title.toLowerCase().includes(jobSearch.toLowerCase()) || j.job_number.toLowerCase().includes(jobSearch.toLowerCase())
  )
  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))

  async function save() {
    if (mode === 'existing' && !selectedJob) { Alert.alert('Select a job'); return }
    if (mode === 'new' && !newTitle.trim()) { Alert.alert('Enter a job title'); return }
    if (endMin <= startMin) { Alert.alert('End time must be after start time'); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

      let jobId = selectedJob?.id ?? null
      if (mode === 'new') {
        const res = await fetch(`${apiBase}/api/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            title: newTitle.trim(),
            customer_id: selectedCustomer?.id ?? null,
            assigned_to: assignedTo,
            status: 'scheduled',
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Could not create job')
        jobId = json.id
      } else if (selectedJob?.status === 'unscheduled') {
        await supabase.from('jobs').update({ status: 'scheduled' }).eq('id', selectedJob.id)
      }

      const scheduledStart = new Date(`${date}T00:00:00`)
      scheduledStart.setMinutes(startMin)
      const scheduledEnd = new Date(`${date}T00:00:00`)
      scheduledEnd.setMinutes(endMin)

      const { error } = await supabase.from('job_visits').insert({
        job_id: jobId,
        assigned_to: assignedTo,
        scheduled_start: scheduledStart.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        notes: notes.trim() || null,
        status: 'scheduled',
      })
      if (error) throw new Error(error.message)

      onSaved()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not schedule visit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Schedule Visit</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

            {!presetJob && (
              <View style={styles.modeRow}>
                <TouchableOpacity style={[styles.modeBtn, mode === 'existing' && styles.modeBtnActive]} onPress={() => setMode('existing')}>
                  <Text style={[styles.modeText, mode === 'existing' && styles.modeTextActive]}>Existing job</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeBtn, mode === 'new' && styles.modeBtnActive]} onPress={() => setMode('new')}>
                  <Text style={[styles.modeText, mode === 'new' && styles.modeTextActive]}>New job</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'existing' ? (
              <>
                <Text style={styles.fieldLabel}>Job</Text>
                {presetJob ? (
                  <View style={styles.selectedBox}><Text style={styles.selectedText}>{presetJob.job_number} — {presetJob.title}</Text></View>
                ) : selectedJob ? (
                  <TouchableOpacity style={styles.selectedBox} onPress={() => setSelectedJob(null)}>
                    <Text style={styles.selectedText}>{selectedJob.job_number} — {selectedJob.title}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 12 }}>Tap to change</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TextInput style={styles.input} placeholder="Search jobs…" placeholderTextColor="#6b7280" value={jobSearch} onChangeText={setJobSearch} autoCorrect={false} />
                    {filteredJobs.slice(0, 30).map(job => (
                      <TouchableOpacity key={job.id} style={styles.jobRow} onPress={() => { setSelectedJob(job); setJobSearch('') }}>
                        <Text style={styles.jobRowNum}>{job.job_number}</Text>
                        <Text style={styles.jobRowTitle} numberOfLines={1}>{job.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Job title</Text>
                <TextInput style={styles.input} placeholder="e.g. Leaky tap repair" placeholderTextColor="#6b7280" value={newTitle} onChangeText={setNewTitle} />
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Customer (optional)</Text>
                {selectedCustomer ? (
                  <TouchableOpacity style={styles.selectedBox} onPress={() => setSelectedCustomer(null)}>
                    <Text style={styles.selectedText}>{selectedCustomer.name}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 12 }}>Tap to change</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TextInput style={styles.input} placeholder="Search customers…" placeholderTextColor="#6b7280" value={customerSearch} onChangeText={setCustomerSearch} autoCorrect={false} />
                    {customerSearch.length > 0 && filteredCustomers.slice(0, 20).map(c => (
                      <TouchableOpacity key={c.id} style={styles.jobRow} onPress={() => { setSelectedCustomer(c); setCustomerSearch('') }}>
                        <Text style={styles.jobRowTitle}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-07-12" placeholderTextColor="#6b7280" />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Start time</Text>
                <TouchableOpacity style={styles.input} onPress={() => setPickerFor('start')}>
                  <Text style={{ fontSize: 15, color: '#111827' }}>{formatHalfHour(startMin)}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>End time</Text>
                <TouchableOpacity style={styles.input} onPress={() => setPickerFor('end')}>
                  <Text style={{ fontSize: 15, color: '#111827' }}>{formatHalfHour(endMin)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {team.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Assign to (optional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {team.map(member => (
                    <TouchableOpacity
                      key={member.id}
                      onPress={() => setAssignedTo(prev => prev === member.id ? null : member.id)}
                      style={[styles.chip, assignedTo === member.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, assignedTo === member.id && styles.chipTextActive]}>{member.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Notes (optional)</Text>
            <TextInput style={[styles.input, { height: 70 }]} multiline value={notes} onChangeText={setNotes} placeholder="Access details, job info…" placeholderTextColor="#6b7280" />

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Schedule visit</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Time picker sheet — 30-min increments */}
        <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
          <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPickerFor(null)}>
            <View style={styles.pickerSheet} onStartShouldSetResponder={() => true}>
              <Text style={styles.pickerTitle}>{pickerFor === 'start' ? 'Start time' : 'End time'}</Text>
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {HALF_HOUR_OPTIONS.map(mins => {
                  const active = pickerFor === 'start' ? startMin === mins : endMin === mins
                  return (
                    <TouchableOpacity
                      key={mins}
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                      onPress={() => {
                        if (pickerFor === 'start') {
                          setStartMin(mins)
                          if (endMin <= mins) setEndMin(mins + 60)
                        } else {
                          setEndMin(mins)
                        }
                        setPickerFor(null)
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: active ? '700' : '400', color: active ? '#f97316' : '#111827' }}>
                        {formatHalfHour(mins)}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  cancelText: { fontSize: 16, color: '#6b7280' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb', marginBottom: 8 },
  modeRow: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  modeText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  modeTextActive: { color: '#111827', fontWeight: '700' },
  selectedBox: { backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#fed7aa' },
  selectedText: { fontSize: 14, color: '#c2410c', fontWeight: '500' },
  jobRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  jobRowNum: { fontSize: 12, color: '#6b7280', fontWeight: '600', minWidth: 56 },
  jobRowTitle: { flex: 1, fontSize: 14, color: '#111827' },
  chip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#c2410c' },
  saveBtn: { backgroundColor: '#f97316', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
})
