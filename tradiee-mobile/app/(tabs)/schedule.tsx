import { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTimezone } from '@/lib/profile-context'
import { formatTime as formatTimeTz, formatDate as formatDateTz } from '@/lib/datetime'

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

export default function ScheduleScreen() {
  const timezone = useTimezone()
  const formatTime = (iso: string | null) => iso ? formatTimeTz(iso, timezone) : '—'
  const formatDate = (iso: string) => formatDateTz(iso, timezone, { weekday: 'short', month: 'short', day: 'numeric' })
  const today = todayIso()

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

  const loading = isLoading || upcomingLoading

  const sections = [
    { title: "Today", data: visits ?? [] },
    { title: "Upcoming", data: upcoming ?? [] },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Schedule</Text>
        <Text style={styles.dateLabel}>{formatDate(new Date().toISOString())}</Text>
      </View>

      {loading ? (
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
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  dateLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  timeColumn: { alignItems: 'center', marginRight: 14, minWidth: 40 },
  timeText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4, marginVertical: 4 },
  cardBody: { flex: 1 },
  jobNumber: { fontSize: 11, color: '#9ca3af', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  jobTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  notes: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  empty: { paddingVertical: 16, alignItems: 'center' },
  emptyText: { color: '#d1d5db', fontSize: 14 },
})
