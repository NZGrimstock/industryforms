import { useCallback, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native'
import { Stack } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useTimezone } from '@/lib/profile-context'
import { formatDate as formatDateTz } from '@/lib/datetime'

type ProjectRow = {
  id: string
  name: string
  status: string
  target_end_date: string | null
  customer_name: string | null
  current_stage_name: string | null
  done_count: number
  stage_count: number
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function ProjectsScreen() {
  const timezone = useTimezone()
  const formatDate = (date: string | null) => date ? formatDateTz(date, timezone, { month: 'short', day: 'numeric' }) : null
  const [refreshing, setRefreshing] = useState(false)
  // Codex build audit marker (2026-07-08): PowerSync-backed mobile Projects view for field crews.
  const { data: projects = [], isLoading } = useQuery<ProjectRow>(`
    SELECT
      p.id,
      p.name,
      p.status,
      p.target_end_date,
      c.name AS customer_name,
      (
        SELECT ps.name
        FROM project_stages ps
        WHERE ps.project_id = p.id
        ORDER BY
          CASE ps.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
          ps.sort_order ASC
        LIMIT 1
      ) AS current_stage_name,
      (
        SELECT COUNT(*)
        FROM project_stages ps
        WHERE ps.project_id = p.id AND ps.status = 'done'
      ) AS done_count,
      (
        SELECT COUNT(*)
        FROM project_stages ps
        WHERE ps.project_id = p.id
      ) AS stage_count
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.status != 'cancelled'
    ORDER BY p.updated_at DESC
  `)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshing(false)
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Projects', headerTintColor: '#f97316' }} />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="folder" size={28} color="#d1d5db" />
              <Text style={styles.emptyText}>No projects yet</Text>
            </View>
          }
          renderItem={({ item }) => {
            const done = Number(item.done_count ?? 0)
            const total = Number(item.stage_count ?? 0)
            const due = formatDate(item.target_end_date)
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    {item.customer_name && <Text style={styles.customer} numberOfLines={1}>{item.customer_name}</Text>}
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>{STATUS_LABEL[item.status] ?? item.status}</Text>
                  </View>
                </View>
                <View style={styles.stageRow}>
                  <Feather name="layers" size={16} color="#f97316" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stageLabel}>Current stage</Text>
                    <Text style={styles.stageName}>{item.current_stage_name ?? 'No stages set'}</Text>
                  </View>
                  <Text style={styles.progress}>{done}/{total}</Text>
                </View>
                {due && <Text style={styles.due}>Target {due}</Text>}
              </View>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  name: { fontSize: 17, fontWeight: '700', color: '#111827' },
  customer: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statusPill: { borderRadius: 999, backgroundColor: '#fff7ed', paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { color: '#ea580c', fontSize: 11, fontWeight: '700' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f9fafb', borderRadius: 12, padding: 12 },
  stageLabel: { fontSize: 11, color: '#6b7280', fontWeight: '700', textTransform: 'uppercase' },
  stageName: { fontSize: 15, color: '#111827', fontWeight: '600', marginTop: 2 },
  progress: { fontSize: 13, color: '#6b7280', fontWeight: '700' },
  due: { marginTop: 10, fontSize: 12, color: '#6b7280' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyText: { color: '#6b7280', fontSize: 15 },
})
