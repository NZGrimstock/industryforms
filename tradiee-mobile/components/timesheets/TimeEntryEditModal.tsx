import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ScrollView, Platform, KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

export type EditableTimeEntry = {
  id: string | null
  job_id: string | null
  job_number: string
  job_title: string
  started_at: string
  ended_at: string | null
  break_minutes: number
  notes: string | null
}
type Job = { id: string; job_number: string; title: string }

// Editing reads/writes device-local wall-clock time (no timezone-offset math),
// matching every other timesheet write path in this app.
function toDateInput(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toTimeInput(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function parseLocalDateTime(dateStr: string, timeStr: string): Date | null {
  const dm = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const tm = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!dm || !tm) return null
  const dt = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]))
  return isNaN(dt.getTime()) ? null : dt
}

interface Props {
  entry: EditableTimeEntry | null
  jobs: Job[]
  companyId: string | null
  onClose: () => void
  onSaved: () => void
}

export function TimeEntryEditModal({ entry, jobs, companyId, onClose, onSaved }: Props) {
  const isNew = !!entry && !entry.id
  const [job, setJob] = useState<Job | null>(null)
  const [jobSearch, setJobSearch] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!entry) return
    setJob(entry.job_id ? { id: entry.job_id, job_number: entry.job_number, title: entry.job_title } : null)
    setJobSearch('')
    setDate(toDateInput(entry.started_at))
    setStartTime(toTimeInput(entry.started_at))
    setEndTime(entry.ended_at ? toTimeInput(entry.ended_at) : '')
    setBreakMinutes(String(entry.break_minutes ?? 0))
    setNotes(entry.notes ?? '')
  }, [entry])

  const filteredJobs = jobs.filter(j =>
    j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.job_number.toLowerCase().includes(jobSearch.toLowerCase())
  )

  async function save() {
    if (!entry) return
    if (!job) { Alert.alert('Select a job'); return }
    const start = parseLocalDateTime(date, startTime)
    if (!start) { Alert.alert('Invalid start', 'Enter date as YYYY-MM-DD and time as HH:MM'); return }
    let end: Date | null = null
    if (endTime.trim()) {
      end = parseLocalDateTime(date, endTime)
      if (!end) { Alert.alert('Invalid end time', 'Enter time as HH:MM'); return }
      if (end.getTime() <= start.getTime()) { Alert.alert('End must be after start'); return }
    }
    setSaving(true)
    if (entry.id) {
      const { error } = await supabase.from('timesheets').update({
        job_id: job.id,
        started_at: start.toISOString(),
        ended_at: end ? end.toISOString() : null,
        break_minutes: parseInt(breakMinutes) || 0,
        notes: notes.trim() || null,
      }).eq('id', entry.id)
      setSaving(false)
      if (error) { Alert.alert('Error', error.message); return }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaving(false); Alert.alert('Error', 'Not signed in'); return }
      const { error } = await supabase.from('timesheets').insert({
        job_id: job.id,
        company_id: companyId,
        profile_id: user.id,
        started_at: start.toISOString(),
        ended_at: end ? end.toISOString() : null,
        break_minutes: parseInt(breakMinutes) || 0,
        notes: notes.trim() || null,
        is_billable: true,
      })
      setSaving(false)
      if (error) { Alert.alert('Error', error.message); return }
    }
    onSaved()
  }

  function confirmDelete() {
    if (!entry?.id) return
    const entryId = entry.id
    Alert.alert('Delete this time entry?', 'This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('timesheets').delete().eq('id', entryId)
          if (error) { Alert.alert('Error', error.message); return }
          onSaved()
        },
      },
    ])
  }

  return (
    <Modal visible={entry !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{isNew ? 'Log Time' : 'Edit Time Entry'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Job</Text>
            <TextInput
              style={styles.input}
              placeholder="Search jobs…"
              placeholderTextColor="#6b7280"
              value={jobSearch}
              onChangeText={setJobSearch}
              autoCorrect={false}
            />
            {job && (
              <TouchableOpacity style={styles.selectedJob} onPress={() => setJob(null)}>
                <Text style={styles.selectedJobText}>{job.job_number} — {job.title}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>Tap to change</Text>
              </TouchableOpacity>
            )}
            {!job && jobSearch.length > 0 && filteredJobs.slice(0, 30).map(j => (
              <TouchableOpacity key={j.id} style={styles.jobRow} onPress={() => { setJob(j); setJobSearch('') }}>
                <Text style={styles.jobRowNum}>{j.job_number}</Text>
                <Text style={styles.jobRowTitle} numberOfLines={1}>{j.title}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-07-12" placeholderTextColor="#6b7280" />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Start (HH:MM)</Text>
                <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="08:00" placeholderTextColor="#6b7280" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>End (HH:MM)</Text>
                <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="Leave blank if running" placeholderTextColor="#6b7280" />
              </View>
            </View>
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Break (minutes)</Text>
            <TextInput style={styles.input} value={breakMinutes} onChangeText={setBreakMinutes} keyboardType="numeric" placeholderTextColor="#6b7280" />
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Notes (optional)</Text>
            <TextInput style={[styles.input, { height: 80 }]} multiline value={notes} onChangeText={setNotes} placeholder="What did you work on?" placeholderTextColor="#6b7280" />
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : isNew ? 'Save entry' : 'Save changes'}</Text>
            </TouchableOpacity>
            {!isNew && (
              <TouchableOpacity style={styles.deleteEntryBtn} onPress={confirmDelete}>
                <Text style={styles.deleteEntryBtnText}>Delete entry</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
  selectedJob: { backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#fed7aa' },
  selectedJobText: { fontSize: 14, color: '#c2410c', fontWeight: '500' },
  jobRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
  jobRowNum: { fontSize: 12, color: '#6b7280', fontWeight: '600', minWidth: 56 },
  jobRowTitle: { flex: 1, fontSize: 14, color: '#111827' },
  saveBtn: { backgroundColor: '#f97316', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteEntryBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteEntryBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
})
