import { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, type GestureResponderEvent } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTimezone } from '@/lib/profile-context'
import { formatTime as formatTimeTz, formatDate as formatDateTz } from '@/lib/datetime'
import { Icon } from '@/lib/icons'
import { ScheduleVisitModal } from '@/components/schedule/ScheduleVisitModal'

const VISIT_STATUS_COLOR: Record<string, string> = {
  scheduled:   '#3b82f6',
  in_progress: '#f97316',
  completed:   '#22c55e',
  cancelled:   '#ef4444',
}

type Visit = {
  id: string
  job_id: string
  job_number: string
  job_title: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string | null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function dateToIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const HOUR_HEIGHT = 60
const GRID_START_HOUR = 0
const GRID_END_HOUR = 24

function hourLabel(hour: number) {
  const period = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${period}`
}

// Minutes since local midnight, in device-local time (matches how visits are
// created — see ScheduleVisitModal, which builds scheduled_start the same way).
function minutesOfDay(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

export default function ScheduleScreen() {
  const timezone = useTimezone()
  const formatTime = (iso: string | null) => iso ? formatTimeTz(iso, timezone) : '—'
  const formatDate = (iso: string) => formatDateTz(iso, timezone, { weekday: 'short', month: 'short', day: 'numeric' })
  const today = todayIso()

  const [tab, setTab] = useState<'overview' | 'calendar'>('overview')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const calendarDateIso = dateToIso(calendarDate)
  const [scheduleModal, setScheduleModal] = useState<{ date: string; startMin: number } | null>(null)

  const { data: visits, isLoading } = useQuery<Visit>(
    `SELECT v.id, v.job_id, v.scheduled_start, v.scheduled_end, v.status, v.notes,
            j.job_number, j.title AS job_title
     FROM job_visits v
     JOIN jobs j ON j.id = v.job_id
     WHERE date(v.scheduled_start) = ?
     ORDER BY v.scheduled_start ASC`,
    [today]
  )

  const { data: upcoming, isLoading: upcomingLoading } = useQuery<Visit>(
    `SELECT v.id, v.job_id, v.scheduled_start, v.scheduled_end, v.status, v.notes,
            j.job_number, j.title AS job_title
     FROM job_visits v
     JOIN jobs j ON j.id = v.job_id
     WHERE date(v.scheduled_start) > ?
     ORDER BY v.scheduled_start ASC
     LIMIT 20`,
    [today]
  )

  const { data: calendarVisits, isLoading: calendarLoading, refresh: refreshCalendar } = useQuery<Visit>(
    `SELECT v.id, v.job_id, v.scheduled_start, v.scheduled_end, v.status, v.notes,
            j.job_number, j.title AS job_title
     FROM job_visits v
     JOIN jobs j ON j.id = v.job_id
     WHERE date(v.scheduled_start) = ?
     ORDER BY v.scheduled_start ASC`,
    [calendarDateIso]
  )

  const loading = isLoading || upcomingLoading

  const sections = [
    { title: "Today", data: visits ?? [] },
    { title: "Upcoming", data: upcoming ?? [] },
  ]

  function shiftDay(delta: number) {
    setCalendarDate(d => {
      const next = new Date(d)
      next.setDate(next.getDate() + delta)
      return next
    })
  }

  function onGridTap(e: GestureResponderEvent) {
    const y = e.nativeEvent.locationY
    const rawMin = (y / HOUR_HEIGHT) * 60 + GRID_START_HOUR * 60
    const snapped = Math.max(0, Math.min(23 * 60 + 30, Math.round(rawMin / 30) * 30))
    setScheduleModal({ date: calendarDateIso, startMin: snapped })
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Schedule</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'overview' && styles.tabActive]} onPress={() => setTab('overview')}>
          <Text style={[styles.tabText, tab === 'overview' && styles.tabTextActive]}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'calendar' && styles.tabActive]} onPress={() => setTab('calendar')}>
          <Text style={[styles.tabText, tab === 'calendar' && styles.tabTextActive]}>Calendar</Text>
        </TouchableOpacity>
      </View>

      {tab === 'overview' ? (
        loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
        ) : (
          <FlatList
            data={sections}
            keyExtractor={s => s.title}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item: section }) => (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.data.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No visits</Text>
                  </View>
                ) : (
                  section.data.map(visit => (
                    <TouchableOpacity
                      key={visit.id}
                      style={styles.card}
                      onPress={() => router.push(`/jobs/${visit.job_id}`)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.timeColumn}>
                        <Text style={styles.timeText}>{formatTime(visit.scheduled_start)}</Text>
                        <View style={[styles.dot, { backgroundColor: VISIT_STATUS_COLOR[visit.status] ?? '#9ca3af' }]} />
                        <Text style={styles.timeText}>{formatTime(visit.scheduled_end)}</Text>
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={styles.jobNumber}>{visit.job_number}</Text>
                        <Text style={styles.jobTitle} numberOfLines={1}>{visit.job_title}</Text>
                        {visit.notes && <Text style={styles.notes} numberOfLines={1}>{visit.notes}</Text>}
                        <View style={[styles.statusBadge, { backgroundColor: (VISIT_STATUS_COLOR[visit.status] ?? '#9ca3af') + '20' }]}>
                          <Text style={[styles.statusText, { color: VISIT_STATUS_COLOR[visit.status] ?? '#9ca3af' }]}>
                            {visit.status.replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          />
        )
      ) : (
        <>
          <View style={styles.dayNav}>
            <TouchableOpacity onPress={() => shiftDay(-1)} hitSlop={10} accessibilityLabel="Previous day">
              <Icon name="chevron-left" size={22} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCalendarDate(new Date())}>
              <Text style={styles.dayNavLabel}>
                {calendarDateIso === today ? 'Today · ' : ''}{formatDate(calendarDate.toISOString())}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shiftDay(1)} hitSlop={10} accessibilityLabel="Next day">
              <Icon name="chevron-right" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

          {calendarLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 52 }}>
                  {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i).map(hour => (
                    <View key={hour} style={{ height: HOUR_HEIGHT }}>
                      <Text style={styles.hourLabel}>{hourLabel(hour)}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={onGridTap}
                    style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT }}
                  >
                    {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => i).map(i => (
                      <View key={i} style={[styles.hourRow, { top: i * HOUR_HEIGHT }]}>
                        <View style={styles.hourLine} />
                        <View style={styles.halfHourLine} />
                      </View>
                    ))}
                    {(calendarVisits ?? []).map(visit => {
                      const startMin = Math.max(0, minutesOfDay(visit.scheduled_start) - GRID_START_HOUR * 60)
                      const endMin = Math.max(startMin + 20, minutesOfDay(visit.scheduled_end) - GRID_START_HOUR * 60)
                      const top = (startMin / 60) * HOUR_HEIGHT
                      const height = ((endMin - startMin) / 60) * HOUR_HEIGHT
                      const color = VISIT_STATUS_COLOR[visit.status] ?? '#9ca3af'
                      return (
                        <TouchableOpacity
                          key={visit.id}
                          style={[styles.visitBlock, { top, height, backgroundColor: color + '20', borderLeftColor: color }]}
                          onPress={() => router.push(`/jobs/${visit.job_id}`)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.visitBlockTitle, { color }]} numberOfLines={1}>{visit.job_number} · {visit.job_title}</Text>
                          <Text style={styles.visitBlockTime} numberOfLines={1}>{formatTime(visit.scheduled_start)} – {formatTime(visit.scheduled_end)}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.fab}
            onPress={() => setScheduleModal({ date: calendarDateIso, startMin: 9 * 60 })}
            accessibilityLabel="Schedule a visit"
          >
            <Icon name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </>
      )}

      <ScheduleVisitModal
        visible={scheduleModal !== null}
        initialDate={scheduleModal?.date ?? calendarDateIso}
        initialStartMin={scheduleModal?.startMin ?? 9 * 60}
        onClose={() => setScheduleModal(null)}
        onSaved={() => { setScheduleModal(null); refreshCalendar?.() }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#111827', fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  timeColumn: { alignItems: 'center', marginRight: 14, minWidth: 40 },
  timeText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4, marginVertical: 4 },
  cardBody: { flex: 1 },
  jobNumber: { fontSize: 11, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  jobTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  notes: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  empty: { paddingVertical: 16, alignItems: 'center' },
  emptyText: { color: '#d1d5db', fontSize: 14 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  dayNavLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  hourLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500', marginTop: -6, textAlign: 'right', paddingRight: 8 },
  hourRow: { position: 'absolute', left: 0, right: 0, height: HOUR_HEIGHT },
  hourLine: { borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  halfHourLine: { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: HOUR_HEIGHT / 2 - 1 },
  visitBlock: { position: 'absolute', left: 4, right: 4, borderRadius: 8, borderLeftWidth: 3, padding: 6, overflow: 'hidden' },
  visitBlockTitle: { fontSize: 12, fontWeight: '700' },
  visitBlockTime: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
})
