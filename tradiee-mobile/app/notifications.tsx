import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Switch,
} from 'react-native'
import { Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon, type IconName } from '@/lib/icons'
import * as Notifications from 'expo-notifications'
import { supabase } from '@/lib/supabase'

type ActivityItem = {
  id: string
  type: 'payment' | 'quote_accepted' | 'quote_declined' | 'enquiry' | 'job'
  title: string
  subtitle: string
  time: string
  icon: IconName
  color: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationsScreen() {
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [togglingPush, setTogglingPush] = useState(false)

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPushEnabled(status === 'granted')
    })
  }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!prof) return

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const cid = prof.company_id

    const [paymentsRes, quotesRes, enquiriesRes] = await Promise.all([
      supabase.from('payments')
        .select('id, amount, paid_at, invoices(invoice_number)')
        .eq('invoices.company_id', cid)
        .gte('paid_at', since)
        .order('paid_at', { ascending: false })
        .limit(20),
      supabase.from('quotes')
        .select('id, quote_number, title, status, updated_at')
        .eq('company_id', cid)
        .in('status', ['accepted', 'declined'])
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase.from('enquiries')
        .select('id, customer_name, status, created_at')
        .eq('company_id', cid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    const items: ActivityItem[] = []

    for (const p of paymentsRes.data ?? []) {
      const inv = (Array.isArray(p.invoices) ? p.invoices[0] : p.invoices) as { invoice_number: string } | null
      items.push({
        id: `pay-${p.id}`,
        type: 'payment',
        title: 'Payment received',
        subtitle: `$${Number(p.amount).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}${inv ? ` — ${inv.invoice_number}` : ''}`,
        time: p.paid_at ?? '',
        icon: 'check-circle',
        color: '#22c55e',
      })
    }

    for (const q of quotesRes.data ?? []) {
      const accepted = q.status === 'accepted'
      items.push({
        id: `quote-${q.id}`,
        type: accepted ? 'quote_accepted' : 'quote_declined',
        title: accepted ? 'Quote accepted' : 'Quote declined',
        subtitle: `${q.quote_number} — ${q.title ?? ''}`,
        time: q.updated_at ?? '',
        icon: accepted ? 'thumbs-up' : 'thumbs-down',
        color: accepted ? '#3b82f6' : '#ef4444',
      })
    }

    for (const e of enquiriesRes.data ?? []) {
      items.push({
        id: `enq-${e.id}`,
        type: 'enquiry',
        title: 'New enquiry',
        subtitle: e.customer_name ?? 'Unknown',
        time: e.created_at ?? '',
        icon: 'inbox',
        color: '#f97316',
      })
    }

    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    setActivity(items)
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function togglePush(value: boolean) {
    setTogglingPush(true)
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync()
      setPushEnabled(status === 'granted')
      if (status === 'granted') {
        try {
          const token = (await Notifications.getExpoPushTokenAsync()).data
          const { data: { user } } = await supabase.auth.getUser()
          if (user) await supabase.from('profiles').update({ expo_push_token: token }).eq('id', user.id)
        } catch {}
      }
    } else {
      setPushEnabled(false)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('profiles').update({ expo_push_token: null }).eq('id', user.id)
    }
    setTogglingPush(false)
  }

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ title: 'Notifications', headerTintColor: '#f97316' }} />

      {/* Push toggle */}
      <View style={s.toggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleTitle}>Push Notifications</Text>
          <Text style={s.toggleSub}>Payments, quote updates, new enquiries</Text>
        </View>
        <Switch
          value={pushEnabled}
          onValueChange={togglePush}
          disabled={togglingPush}
          trackColor={{ true: '#f97316', false: '#e5e7eb' }}
          thumbColor="#fff"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
      ) : (
        <FlatList
          data={activity}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListHeaderComponent={
            activity.length > 0
              ? <Text style={s.sectionLabel}>Last 14 days</Text>
              : null
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="bell" size={40} color="#d1d5db" />
              <Text style={s.emptyText}>No recent activity</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={[s.iconCircle, { backgroundColor: item.color + '20' }]}>
                <Icon name={item.icon} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{item.title}</Text>
                <Text style={s.itemSub} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              <Text style={s.timeText}>{timeAgo(item.time)}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 14, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  toggleSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  timeText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 15 },
})
