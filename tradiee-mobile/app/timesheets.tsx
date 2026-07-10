import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, ScrollView, Switch, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, Stack, router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import {
  startTracking,
  stopTracking,
  isTracking,
  requestPermissions,
  TRIP_FOLLOWUP_KEY,
  AUTO_CHECKIN_NOTICE_KEY,
  TRADING_HOURS_KEY,
  DEFAULT_TRADING_HOURS,
  loadTradingHours,
  syncTrackingToSchedule,
  type AutoCheckinNotice,
  type TripFollowup,
  type TradingHours,
} from '@/lib/location/tracking'
import { useTimezone } from '@/lib/profile-context'
import { formatTime as formatTimeTz, formatDate as formatDateTz } from '@/lib/datetime'

const ACTIVE_JOB_KEY = 'TRADIEE_ACTIVE_JOB'
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30)

function formatHalfHour(mins: number) {
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  const period = hh < 12 ? 'AM' : 'PM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${mm.toString().padStart(2, '0')} ${period}`
}

type TimeEntry = {
  id: string; job_id: string; job_number: string; job_title: string
  started_at: string; ended_at: string | null; break_minutes: number; notes: string | null
}
type TravelLog = {
  id: string; started_at: string; ended_at: string | null
  distance_km: number; purpose: string | null; job_id: string | null; is_auto: number
}
type Job = { id: string; job_number: string; title: string }

function formatDuration(start: string, end: string | null, breakMin = 0) {
  if (!end) return 'In progress'
  const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) - breakMin)
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
const TAB_TIME = 'time'
const TAB_TRAVEL = 'travel'

export default function TimesheetsScreen() {
  const timezone = useTimezone()
  const formatTime = (iso: string) => formatTimeTz(iso, timezone)
  // Compare the calendar day in the user's own timezone, not the device's, so
  // "Today"/"Yesterday" match what they'd expect from their account setting.
  const formatDate = (iso: string) => {
    const dayKey = (d: Date) => formatDateTz(d, timezone, { year: 'numeric', month: 'numeric', day: 'numeric' })
    const today = new Date()
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    const key = dayKey(new Date(iso))
    if (key === dayKey(today)) return 'Today'
    if (key === dayKey(yesterday)) return 'Yesterday'
    return formatDateTz(iso, timezone, { month: 'short', day: 'numeric' })
  }
  const [tab, setTab] = useState<'time' | 'travel'>(TAB_TIME)
  const [tracking, setTracking] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showTradingHours, setShowTradingHours] = useState(false)
  const [tradingHours, setTradingHours] = useState<TradingHours>(DEFAULT_TRADING_HOURS)
  const [savingTradingHours, setSavingTradingHours] = useState(false)
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null)
  const [showAllocModal, setShowAllocModal] = useState(false)
  const [allocLog, setAllocLog] = useState<TravelLog | null>(null)
  const [allocJob, setAllocJob] = useState<Job | null>(null)
  const [allocJobSearch, setAllocJobSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [notes, setNotes] = useState('')
  const [breakMin, setBreakMin] = useState('0')
  const [saving, setSaving] = useState(false)
  const [jobSearch, setJobSearch] = useState('')
  const [tripFollowup, setTripFollowup] = useState<TripFollowup | null>(null)
  const [showStartTimer, setShowStartTimer] = useState(false)
  const [timerJob, setTimerJob] = useState<Job | null>(null)
  const [timerJobSearch, setTimerJobSearch] = useState('')
  const [startingTimer, setStartingTimer] = useState(false)
  const [autoCheckinNotice, setAutoCheckinNotice] = useState<AutoCheckinNotice | null>(null)

  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [travelLogs, setTravelLogs] = useState<TravelLog[]>([])
  const [activeJobs, setActiveJobs] = useState<Job[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loadingTime, setLoadingTime] = useState(true)
  const [loadingTravel, setLoadingTravel] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    isTracking().then(setTracking)
    loadTradingHours().then(setTradingHours)
  }, [])

  useFocusEffect(useCallback(() => {
    // Check for a completed trip waiting for job timer follow-up
    AsyncStorage.getItem(TRIP_FOLLOWUP_KEY).then(raw => {
      if (raw) setTripFollowup(JSON.parse(raw))
    })
    AsyncStorage.getItem(AUTO_CHECKIN_NOTICE_KEY).then(raw => {
      setAutoCheckinNotice(raw ? JSON.parse(raw) : null)
    })
    syncTrackingToSchedule().then(setTracking)
  }, []))

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) return
    setCompanyId(profile.company_id)

    const [timesheetsRes, travelRes, jobsRes] = await Promise.all([
      supabase
        .from('timesheets')
        .select('id, job_id, started_at, ended_at, break_minutes, notes, jobs(job_number, title)')
        .eq('company_id', profile.company_id)
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('travel_logs')
        .select('id, started_at, ended_at, distance_km, purpose, job_id, is_auto')
        .eq('company_id', profile.company_id)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('jobs')
        .select('id, job_number, title')
        .eq('company_id', profile.company_id)
        .not('status', 'in', '(completed,cancelled)')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    setEntries(
      (timesheetsRes.data ?? []).map(t => {
        const j = (Array.isArray(t.jobs) ? t.jobs[0] : t.jobs) as { job_number: string; title: string } | null
        return {
        id: t.id,
        job_id: t.job_id,
        job_number: j?.job_number ?? '',
        job_title: j?.title ?? '',
        started_at: t.started_at,
        ended_at: t.ended_at,
        break_minutes: t.break_minutes ?? 0,
        notes: t.notes,
      }
      })
    )
    setTravelLogs(travelRes.data ?? [])
    setActiveJobs(jobsRes.data ?? [])
  }, [])

  useEffect(() => {
    fetchAll().finally(() => { setLoadingTime(false); setLoadingTravel(false) })
  }, [fetchAll])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  async function toggleTracking() {
    if (tracking) {
      await stopTracking()
      setTracking(false)
    } else {
      const ok = await requestPermissions()
      if (!ok) { Alert.alert('Permission required', 'Location permission is needed to auto-track travel.'); return }
      await startTracking()
      setTracking(true)
    }
  }

  async function saveTradingHours(hours: TradingHours) {
    setSavingTradingHours(true)
    await AsyncStorage.setItem(TRADING_HOURS_KEY, JSON.stringify(hours))
    setTradingHours(hours)
    await syncTrackingToSchedule().then(setTracking)
    setSavingTradingHours(false)
    setShowTradingHours(false)
  }

  async function logTime() {
    if (!selectedJob) { Alert.alert('Select a job'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const now = new Date()
    const started = new Date(now.getTime() - 60 * 60 * 1000)
    const { error } = await supabase.from('timesheets').insert({
      job_id: selectedJob.id, profile_id: user.id, company_id: companyId,
      started_at: started.toISOString(), ended_at: now.toISOString(),
      break_minutes: parseInt(breakMin) || 0, notes: notes || null, is_billable: true,
    })
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    setShowLogModal(false); setSelectedJob(null); setNotes(''); setBreakMin('0')
    fetchAll()
  }

  async function dismissFollowup() {
    await AsyncStorage.removeItem(TRIP_FOLLOWUP_KEY)
    setTripFollowup(null)
  }

  async function dismissAutoCheckin() {
    await AsyncStorage.removeItem(AUTO_CHECKIN_NOTICE_KEY)
    setAutoCheckinNotice(null)
  }

  async function viewAutoCheckedJob() {
    if (!autoCheckinNotice) return
    await dismissAutoCheckin()
    router.push(`/jobs/${autoCheckinNotice.jobId}`)
  }

  async function startJobTimer(job: Job) {
    setStartingTimer(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStartingTimer(false); return }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) { setStartingTimer(false); return }
    const now = new Date().toISOString()
    const closeStartTimer = async () => {
      setShowStartTimer(false)
      setTimerJob(null)
      setTimerJobSearch('')
      await dismissFollowup()
    }
    const reconcileOpenTimer = async () => {
      const { data: open } = await supabase
        .from('timesheets')
        .select('id, job_id, started_at')
        .eq('profile_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!open) return false
      await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
        jobId: open.job_id ?? job.id,
        timesheetId: open.id,
        startedAt: open.started_at,
      }))
      await closeStartTimer()
      Alert.alert('Timer already running', 'Stop your current job timer before starting another one.')
      fetchAll()
      return true
    }
    const { data: existing } = await supabase
      .from('timesheets')
      .select('id, job_id, started_at')
      .eq('profile_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
        jobId: existing.job_id ?? job.id,
        timesheetId: existing.id,
        startedAt: existing.started_at,
      }))
      setStartingTimer(false)
      await closeStartTimer()
      Alert.alert('Timer already running', 'Stop your current job timer before starting another one.')
      fetchAll()
      return
    }
    const { data: ts, error } = await supabase.from('timesheets').insert({
      job_id: job.id, profile_id: user.id, company_id: profile.company_id,
      started_at: now, ended_at: null, break_minutes: 0, is_billable: true,
    }).select('id').single()
    if (error) {
      if ((error as { code?: string }).code === '23505' && await reconcileOpenTimer()) {
        setStartingTimer(false)
        return
      }
      Alert.alert('Error', error.message)
      setStartingTimer(false)
      return
    }
    if (!ts) {
      Alert.alert('Error', 'Could not start the timer.')
      setStartingTimer(false)
      return
    }
    await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({ jobId: job.id, timesheetId: ts.id, startedAt: now }))
    setStartingTimer(false)
    await closeStartTimer()
    fetchAll()
  }

  async function allocate(log: TravelLog, purpose: 'work' | 'personal' | 'ignore', jobId?: string) {
    const { error } = await supabase.from('travel_logs')
      .update({ purpose, job_id: jobId ?? null })
      .eq('id', log.id)
    if (error) Alert.alert('Error', error.message)
    setShowAllocModal(false); setAllocLog(null); setAllocJob(null); setAllocJobSearch('')
    fetchAll()
  }

  // Permanently removes a trip that isn't a real trip at all (GPS glitch,
  // duplicate) — distinct from "Ignore", which keeps the row but excludes it
  // from the logbook.
  function confirmDeleteTrip(log: TravelLog) {
    Alert.alert('Delete this trip?', 'This removes it permanently — not just from the logbook. Use "Ignore" instead if it\'s a real trip you just don\'t want counted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('travel_logs').delete().eq('id', log.id)
          if (error) { Alert.alert('Error', error.message); return }
          setShowAllocModal(false); setAllocLog(null); setAllocJob(null); setAllocJobSearch('')
          fetchAll()
        },
      },
    ])
  }

  const filteredJobs = activeJobs.filter(j =>
    j.title.toLowerCase().includes(jobSearch.toLowerCase()) ||
    j.job_number.toLowerCase().includes(jobSearch.toLowerCase())
  )

  const filteredAllocJobs = activeJobs.filter(j =>
    j.title.toLowerCase().includes(allocJobSearch.toLowerCase()) ||
    j.job_number.toLowerCase().includes(allocJobSearch.toLowerCase())
  )

  const unallocated = travelLogs.filter(l => !l.purpose).length

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Time Logs', headerTintColor: '#f97316' }} />
      <View style={styles.header}>
        <Text style={styles.heading}>Time</Text>
        <View style={styles.trackingRow}>
          <Text style={styles.trackingLabel}>
            {tracking ? 'Auto-track on' : tradingHours.enabled ? 'Auto-track (scheduled)' : 'Auto-track'}
          </Text>
          <Switch
            value={tracking}
            onValueChange={toggleTracking}
            trackColor={{ false: '#e5e7eb', true: '#fdba74' }}
            thumbColor={tracking ? '#f97316' : '#9ca3af'}
          />
          <TouchableOpacity onPress={() => setShowTradingHours(true)} style={{ padding: 4 }}>
            <Feather name="settings" size={15} color={tradingHours.enabled ? '#f97316' : '#9ca3af'} />
          </TouchableOpacity>
        </View>
      </View>

      {autoCheckinNotice && (
        <View style={styles.autoBanner}>
          <View style={styles.autoIcon}>
            <Feather name="map-pin" size={16} color="#15803d" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.autoBannerTitle}>Auto check-in started</Text>
            <Text style={styles.autoBannerSub} numberOfLines={2}>
              {autoCheckinNotice.jobNumber} - {autoCheckinNotice.jobTitle} ({autoCheckinNotice.distanceM} m away)
            </Text>
          </View>
          <TouchableOpacity style={styles.autoBannerBtn} onPress={viewAutoCheckedJob}>
            <Text style={styles.autoBannerBtnText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismissAutoCheckin} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color="#16a34a" />
          </TouchableOpacity>
        </View>
      )}

      {tripFollowup && (
        <View style={styles.tripBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tripBannerTitle}>Trip recorded — {tripFollowup.distanceKm.toFixed(1)} km</Text>
            <Text style={styles.tripBannerSub}>Arrived {formatTime(tripFollowup.endTime)} · Start job timer?</Text>
          </View>
          <TouchableOpacity style={styles.tripBannerBtn} onPress={() => { setShowStartTimer(true) }}>
            <Text style={styles.tripBannerBtnText}>Start timer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismissFollowup} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === TAB_TIME && styles.tabActive]} onPress={() => setTab(TAB_TIME)}>
          <Text style={[styles.tabText, tab === TAB_TIME && styles.tabTextActive]}>Time logs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === TAB_TRAVEL && styles.tabActive]} onPress={() => setTab(TAB_TRAVEL)}>
          <Text style={[styles.tabText, tab === TAB_TRAVEL && styles.tabTextActive]}>
            Travel {unallocated > 0 ? `(${unallocated} to review)` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === TAB_TIME ? (
        <>
          <View style={styles.addRow}>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowLogModal(true)}>
              <Text style={styles.addBtnText}>+ Log time manually</Text>
            </TouchableOpacity>
          </View>
          {loadingTime ? <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" /> : (
            <FlatList
              data={entries}
              keyExtractor={e => e.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
              ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No time entries yet</Text></View>}
              renderItem={({ item: e }) => (
                <View style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.jobNum}>{e.job_number}</Text>
                    <Text style={[styles.duration, !e.ended_at && { color: '#22c55e' }]}>
                      {formatDuration(e.started_at, e.ended_at, e.break_minutes)}
                    </Text>
                  </View>
                  <Text style={styles.jobTitle} numberOfLines={1}>{e.job_title}</Text>
                  <Text style={styles.timeRange}>
                    {formatDate(e.started_at)} · {formatTime(e.started_at)}
                    {e.ended_at ? ` → ${formatTime(e.ended_at)}` : ' · in progress'}
                  </Text>
                  {e.notes ? <Text style={styles.noteText} numberOfLines={1}>{e.notes}</Text> : null}
                </View>
              )}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.addRow}>
            {unallocated > 0 && (
              <Text style={styles.reviewHint}>{unallocated} trip{unallocated > 1 ? 's' : ''} need review — tap to allocate</Text>
            )}
          </View>
          {loadingTravel ? <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" /> : (
            <FlatList
              data={travelLogs}
              keyExtractor={l => l.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No travel logs yet</Text>
                  <Text style={[styles.emptyText, { fontSize: 13, marginTop: 6 }]}>Enable auto-track above to start logging</Text>
                </View>
              }
              renderItem={({ item: log }) => {
                const purposeColor = log.purpose === 'work' ? '#22c55e' : log.purpose === 'personal' ? '#3b82f6' : log.purpose === 'ignore' ? '#9ca3af' : '#f97316'
                const purposeLabel = log.purpose === 'work' ? 'Work' : log.purpose === 'personal' ? 'Personal' : log.purpose === 'ignore' ? 'Ignored' : 'Needs review'
                return (
                  <TouchableOpacity
                    style={[styles.card, !log.purpose && styles.cardUnallocated]}
                    onPress={() => { if (!log.purpose) { setAllocLog(log); setShowAllocModal(true) } }}
                    activeOpacity={log.purpose ? 1 : 0.7}
                  >
                    <View style={styles.cardRow}>
                      <View style={styles.travelLeft}>
                        <Text style={styles.travelKm}>{(log.distance_km ?? 0).toFixed(1)} km</Text>
                        <Text style={styles.travelAuto}>{log.is_auto ? 'Auto' : 'Manual'}</Text>
                      </View>
                      <View style={[styles.purposeBadge, { backgroundColor: purposeColor + '20' }]}>
                        <Text style={[styles.purposeText, { color: purposeColor }]}>{purposeLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.timeRange}>
                      {formatDate(log.started_at)} · {formatTime(log.started_at)}
                      {log.ended_at ? ` → ${formatTime(log.ended_at)}` : ' · in progress'}
                    </Text>
                    {!log.purpose && <Text style={styles.allocHint}>Tap to allocate →</Text>}
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </>
      )}

      {/* Start job timer modal (after trip) */}
      <Modal visible={showStartTimer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowStartTimer(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Start job timer</Text>
            <TouchableOpacity onPress={() => setShowStartTimer(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {tripFollowup && (
              <View style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Feather name="navigation" size={16} color="#f97316" />
                <Text style={{ fontSize: 13, color: '#c2410c', fontWeight: '500' }}>
                  Trip ended · {tripFollowup.distanceKm.toFixed(1)} km · arrived {formatTime(tripFollowup.endTime)}
                </Text>
              </View>
            )}
            <Text style={styles.fieldLabel}>Select job to start timing</Text>
            <TextInput
              style={styles.input}
              placeholder="Search jobs…"
              placeholderTextColor="#6b7280"
              value={timerJobSearch}
              onChangeText={setTimerJobSearch}
              autoCorrect={false}
            />
            {timerJob ? (
              <TouchableOpacity style={styles.selectedJob} onPress={() => setTimerJob(null)}>
                <Text style={styles.selectedJobText}>{timerJob.job_number} — {timerJob.title}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>Tap to change</Text>
              </TouchableOpacity>
            ) : (
              activeJobs
                .filter(j => j.title.toLowerCase().includes(timerJobSearch.toLowerCase()) || j.job_number.toLowerCase().includes(timerJobSearch.toLowerCase()))
                .slice(0, 30)
                .map(job => (
                  <TouchableOpacity key={job.id} style={styles.jobRow} onPress={() => { setTimerJob(job); setTimerJobSearch('') }}>
                    <Text style={styles.jobRowNum}>{job.job_number}</Text>
                    <Text style={styles.jobRowTitle} numberOfLines={1}>{job.title}</Text>
                  </TouchableOpacity>
                ))
            )}
            {timerJob && (
              <TouchableOpacity
                style={[styles.saveBtn, startingTimer && { opacity: 0.6 }]}
                onPress={() => startJobTimer(timerJob)}
                disabled={startingTimer}
              >
                <Text style={styles.saveBtnText}>{startingTimer ? 'Starting…' : 'Start timer'}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Trading hours modal */}
      <Modal visible={showTradingHours} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTradingHours(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Auto-track schedule</Text>
            <TouchableOpacity onPress={() => setShowTradingHours(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              Set trading hours to automatically start and stop GPS tracking. The app must be opened within the window for the schedule to take effect.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>Enable schedule</Text>
              <Switch
                value={tradingHours.enabled}
                onValueChange={v => setTradingHours(h => ({ ...h, enabled: v }))}
                trackColor={{ false: '#e5e7eb', true: '#fdba74' }}
                thumbColor={tradingHours.enabled ? '#f97316' : '#9ca3af'}
              />
            </View>
            {tradingHours.enabled && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Start time</Text>
                    <TouchableOpacity style={styles.input} onPress={() => setPickerFor('start')}>
                      <Text style={{ fontSize: 15, color: '#111827' }}>{formatHalfHour(tradingHours.startMin)}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>End time</Text>
                    <TouchableOpacity style={styles.input} onPress={() => setPickerFor('end')}>
                      <Text style={{ fontSize: 15, color: '#111827' }}>{formatHalfHour(tradingHours.endMin)}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View>
                  <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Days</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DAY_LABELS.map((label, i) => {
                      const active = tradingHours.days.includes(i)
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setTradingHours(h => ({
                            ...h,
                            days: active ? h.days.filter(d => d !== i) : [...h.days, i].sort()
                          }))}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
                            backgroundColor: active ? '#f97316' : '#f3f4f6',
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#6b7280' }}>{label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              </>
            )}
            <TouchableOpacity
              style={[styles.logBtn, savingTradingHours && { opacity: 0.5 }]}
              onPress={() => saveTradingHours(tradingHours)}
              disabled={savingTradingHours}
              activeOpacity={0.85}
            >
              <Text style={styles.logBtnText}>{savingTradingHours ? 'Saving…' : 'Save schedule'}</Text>
            </TouchableOpacity>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Start/end time picker — 30-min increments */}
      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <TouchableOpacity style={styles.allocOverlay} activeOpacity={1} onPress={() => setPickerFor(null)}>
          <View style={styles.allocSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.allocTitle}>{pickerFor === 'start' ? 'Start time' : 'End time'}</Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {HALF_HOUR_OPTIONS.map(mins => {
                const active = pickerFor === 'start' ? tradingHours.startMin === mins : tradingHours.endMin === mins
                return (
                  <TouchableOpacity
                    key={mins}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                    onPress={() => {
                      setTradingHours(h => pickerFor === 'start' ? { ...h, startMin: mins } : { ...h, endMin: mins })
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

      {/* Log time modal */}
      <Modal visible={showLogModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLogModal(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Time</Text>
            <TouchableOpacity onPress={() => setShowLogModal(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Job</Text>
            <TextInput style={styles.input} placeholder="Search jobs…" placeholderTextColor="#6b7280" value={jobSearch} onChangeText={setJobSearch} autoCorrect={false} />
            {selectedJob && (
              <TouchableOpacity style={styles.selectedJob} onPress={() => setSelectedJob(null)}>
                <Text style={styles.selectedJobText}>{selectedJob.job_number} — {selectedJob.title}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>Tap to change</Text>
              </TouchableOpacity>
            )}
            {!selectedJob && filteredJobs.slice(0, 30).map(job => (
              <TouchableOpacity key={job.id} style={styles.jobRow} onPress={() => { setSelectedJob(job); setJobSearch('') }}>
                <Text style={styles.jobRowNum}>{job.job_number}</Text>
                <Text style={styles.jobRowTitle} numberOfLines={1}>{job.title}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Break (minutes)</Text>
            <TextInput style={styles.input} value={breakMin} onChangeText={setBreakMin} keyboardType="numeric" placeholderTextColor="#6b7280" />
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Notes (optional)</Text>
            <TextInput style={[styles.input, { height: 80 }]} multiline value={notes} onChangeText={setNotes} placeholder="What did you work on?" placeholderTextColor="#6b7280" />
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={logTime} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save entry'}</Text>
            </TouchableOpacity>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Allocate travel modal */}
      <Modal visible={showAllocModal} transparent animationType="slide">
        <View style={styles.allocOverlay}>
          <View style={styles.allocSheet}>
            <Text style={styles.allocTitle}>Allocate trip</Text>
            {allocLog && (
              <Text style={styles.allocSub}>
                {(allocLog.distance_km ?? 0).toFixed(1)} km · {formatDate(allocLog.started_at)} {formatTime(allocLog.started_at)}
              </Text>
            )}
            <TouchableOpacity style={styles.allocRow} onPress={() => allocLog && allocate(allocLog, 'personal')}>
              <Text style={styles.allocIcon}>🚗</Text>
              <View>
                <Text style={styles.allocLabel}>Personal travel</Text>
                <Text style={styles.allocDesc}>Not work-related</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.allocRow} onPress={() => allocLog && allocate(allocLog, 'ignore')}>
              <Text style={styles.allocIcon}>🗑</Text>
              <View>
                <Text style={styles.allocLabel}>Ignore</Text>
                <Text style={styles.allocDesc}>Remove from logbook</Text>
              </View>
            </TouchableOpacity>
            <View style={[styles.allocRow, { flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Text style={styles.allocIcon}>💼</Text>
                <View>
                  <Text style={styles.allocLabel}>Work — assign to job</Text>
                  <Text style={styles.allocDesc}>Links trip to a job</Text>
                </View>
              </View>
              <TextInput
                style={[styles.input, { marginBottom: 0, width: '100%' }]}
                placeholder="Search jobs…"
                placeholderTextColor="#6b7280"
                value={allocJobSearch}
                onChangeText={setAllocJobSearch}
              />
              {allocJob && (
                <View style={styles.selectedJob}>
                  <Text style={styles.selectedJobText}>{allocJob.job_number} — {allocJob.title}</Text>
                </View>
              )}
              {!allocJob && allocJobSearch.length > 0 && filteredAllocJobs.slice(0, 30).map(job => (
                <TouchableOpacity key={job.id} style={styles.jobRow} onPress={() => { setAllocJob(job); setAllocJobSearch('') }}>
                  <Text style={styles.jobRowNum}>{job.job_number}</Text>
                  <Text style={styles.jobRowTitle} numberOfLines={1}>{job.title}</Text>
                </TouchableOpacity>
              ))}
              {allocJob && (
                <TouchableOpacity
                  style={[styles.saveBtn, { marginTop: 4 }]}
                  onPress={() => allocLog && allocate(allocLog, 'work', allocJob.id)}
                >
                  <Text style={styles.saveBtnText}>Save as work trip</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.allocRow} onPress={() => allocLog && confirmDeleteTrip(allocLog)}>
              <Text style={styles.allocIcon}>❌</Text>
              <View>
                <Text style={[styles.allocLabel, { color: '#dc2626' }]}>Delete permanently</Text>
                <Text style={styles.allocDesc}>Not allocatable — remove entirely (GPS glitch, duplicate)</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.allocCancel} onPress={() => { setShowAllocModal(false); setAllocLog(null) }}>
              <Text style={{ color: '#6b7280', fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  trackingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackingLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#111827', fontWeight: '600' },
  addRow: { paddingHorizontal: 16, paddingVertical: 8 },
  addBtn: { backgroundColor: '#fff7ed', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fed7aa' },
  addBtnText: { color: '#f97316', fontWeight: '600', fontSize: 14 },
  reviewHint: { fontSize: 13, color: '#f97316', fontWeight: '500' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardUnallocated: { borderWidth: 1, borderColor: '#fed7aa' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jobNum: { fontSize: 11, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5 },
  duration: { fontSize: 14, fontWeight: '700', color: '#f97316' },
  jobTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  timeRange: { fontSize: 12, color: '#6b7280' },
  noteText: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  travelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  travelKm: { fontSize: 16, fontWeight: '700', color: '#111827' },
  travelAuto: { fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  purposeBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  purposeText: { fontSize: 11, fontWeight: '600' },
  allocHint: { fontSize: 12, color: '#f97316', marginTop: 6, fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#6b7280', fontSize: 15 },
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
  logBtn: { backgroundColor: '#f97316', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  allocOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  allocSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  allocTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  allocSub: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  allocIcon: { fontSize: 24, width: 32 },
  allocLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  allocDesc: { fontSize: 12, color: '#6b7280' },
  allocCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  tripBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, backgroundColor: '#fff7ed', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#fed7aa' },
  tripBannerTitle: { fontSize: 13, fontWeight: '700', color: '#c2410c' },
  tripBannerSub: { fontSize: 12, color: '#9a3412', marginTop: 1 },
  tripBannerBtn: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  tripBannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  autoBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  autoIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dcfce7' },
  autoBannerTitle: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  autoBannerSub: { fontSize: 12, color: '#166534', marginTop: 1 },
  autoBannerBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  autoBannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
