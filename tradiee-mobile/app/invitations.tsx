import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { router, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useTimezone } from '@/lib/profile-context'
import { formatDate } from '@/lib/datetime'

type InvitationItem = {
  id: string
  token: string
  status: string
  job_title: string
  created_at: string
  companies: { name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f97316',
  accepted: '#22c55e',
  declined: '#ef4444',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#9ca3af'
  return (
    <View style={[styles.badge, { backgroundColor: color + '1a', borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  )
}

export default function InvitationsTab() {
  const timezone = useTimezone()
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchInvitations() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', session.user.id)
      .single()

    if (!profile?.company_id) {
      setInvitations([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const { data } = await supabase
      .from('job_invitations')
      .select('id, token, status, job_title, created_at, companies!contractor_company_id(name)')
      .eq('subcontractor_company_id', profile.company_id)
      .order('created_at', { ascending: false })

    setInvitations((data ?? []).map(d => ({
      id: d.id,
      token: d.token,
      status: d.status,
      job_title: d.job_title,
      created_at: d.created_at,
      companies: (Array.isArray(d.companies) ? d.companies[0] : d.companies) ?? null,
    })))
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    fetchInvitations()
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchInvitations()
  }, [])

  function renderItem({ item }: { item: InvitationItem }) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/invite/${item.token}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <Text style={styles.company} numberOfLines={1}>
            {item.companies?.name ?? 'Unknown Company'}
          </Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.jobTitle} numberOfLines={2}>
          {item.job_title}
        </Text>
        <Text style={styles.date}>
          {formatDate(item.created_at, timezone, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Invitations', headerTintColor: '#f97316' }} />
        <ActivityIndicator size="large" color="#f97316" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Invitations', headerTintColor: '#f97316' }} />
      <FlatList
        data={invitations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={invitations.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyTitle}>No invitations</Text>
            <Text style={styles.emptySub}>
              Job invitations from contractors will appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  company: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    flex: 1,
    marginRight: 8,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  date: {
    fontSize: 12,
    color: '#6b7280',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
})
