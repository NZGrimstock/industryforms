import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { getJobStatuses, resolveStatus, DEFAULT_JOB_STATUSES, type JobStatus } from '@/lib/job-statuses'

type Job = { id: string; job_number: string; title: string; status: string; description: string | null }

export default function JobsScreen() {
  const [search, setSearch] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [statuses, setStatuses] = useState<JobStatus[]>(DEFAULT_JOB_STATUSES)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scope, setScope] = useState<'mine' | 'all'>('mine')

  const fetchJobs = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) return
    getJobStatuses(profile.company_id).then(setStatuses)
    let q = supabase
      .from('jobs')
      .select('id, job_number, title, status, description')
      .eq('company_id', profile.company_id)
    if (scope === 'mine') q = q.eq('assigned_to', user.id)
    const { data } = await q.order('created_at', { ascending: false }).limit(200)
    setJobs(data ?? [])
  }, [scope])

  useEffect(() => {
    setIsLoading(true)
    fetchJobs().finally(() => setIsLoading(false))
  }, [fetchJobs])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchJobs()
    setRefreshing(false)
  }, [fetchJobs])

  const filtered = jobs.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.job_number.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Jobs</Text>
        <Text style={styles.count}>{filtered.length}</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search jobs…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      <View style={styles.scopeRow}>
        <TouchableOpacity
          style={[styles.scopeBtn, scope === 'mine' && styles.scopeBtnActive]}
          onPress={() => setScope('mine')}
        >
          <Text style={[styles.scopeText, scope === 'mine' && styles.scopeTextActive]}>My jobs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scopeBtn, scope === 'all' && styles.scopeBtnActive]}
          onPress={() => setScope('all')}
        >
          <Text style={[styles.scopeText, scope === 'all' && styles.scopeTextActive]}>All jobs</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={j => j.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{search ? 'No jobs match your search' : scope === 'mine' ? 'No jobs assigned to you' : 'No jobs yet'}</Text>
            </View>
          }
          renderItem={({ item: job }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/jobs/${job.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.jobNumber}>{job.job_number}</Text>
                {(() => {
                  const { hex, label } = resolveStatus(statuses, job.status)
                  return (
                    <View style={[styles.statusBadge, { backgroundColor: hex + '20' }]}>
                      <Text style={[styles.statusText, { color: hex }]}>{label}</Text>
                    </View>
                  )
                })()}
              </View>
              <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
              {job.description && (
                <Text style={styles.jobDesc} numberOfLines={2}>{job.description}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  count: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 4, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, height: 44 },
  searchIcon: { marginRight: 8, fontSize: 14 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  scopeRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4, marginBottom: 4, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 },
  scopeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  scopeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  scopeText: { fontSize: 13, fontWeight: '500', color: '#9ca3af' },
  scopeTextActive: { color: '#111827', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  jobNumber: { fontSize: 12, color: '#9ca3af', fontWeight: '600', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  jobTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  jobDesc: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
})
