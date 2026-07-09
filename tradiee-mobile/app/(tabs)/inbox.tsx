import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { Stack, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getConversations, type ConversationSummary } from '@/lib/notify'
import { colors, radius, shadow } from '@/lib/theme'

const POLL_MS = 15000

type FilterKey = 'open' | 'unread' | 'enquiries' | 'bookings' | 'unmatched' | 'closed'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'unread', label: 'Unread' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'closed', label: 'Closed' },
]

const SOURCE_ICON: Record<ConversationSummary['source'], string> = {
  sms: '\u{1F4AC}',
  email: '✉️',
  booking: '\u{1F4C5}',
  enquiry: '✉️',
  web_lead: '✉️',
}

const STATUS_PILL: Record<ConversationSummary['status'], { bg: string; fg: string; label: string }> = {
  open: { bg: colors.infoBg, fg: '#1d4ed8', label: 'Open' },
  pending: { bg: colors.brandBg, fg: colors.brandDark, label: 'Pending' },
  closed: { bg: '#f3f4f6', fg: colors.sub, label: 'Closed' },
  spam: { bg: colors.dangerBg, fg: '#b91c1c', label: 'Spam' },
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function avatarColor(key: string) {
  const palette = [colors.brand, colors.info, colors.purple, colors.success, colors.sub]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function matchesFilter(c: ConversationSummary, filter: FilterKey) {
  switch (filter) {
    case 'open': return c.status === 'open' || c.status === 'pending'
    case 'unread': return c.unread
    case 'enquiries': return c.source === 'enquiry' || c.source === 'web_lead'
    case 'bookings': return c.source === 'booking'
    case 'unmatched': return c.source === 'sms' && c.customerId === null
    case 'closed': return c.status === 'closed' || c.status === 'spam'
  }
}

export default function InboxScreen() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('open')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const { conversations, smsEnabled } = await getConversations()
      setConversations(conversations)
      setSmsEnabled(smsEnabled)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox')
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
    pollRef.current = setInterval(load, POLL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const filtered = conversations.filter(c => matchesFilter(c, filter))
  const unreadCount = conversations.filter(c => c.unread).length

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <Text style={s.title}>Inbox</Text>
        <Text style={s.sub}>{unreadCount > 0 ? `${unreadCount} waiting on you` : 'All caught up'}</Text>
      </View>

      <View style={s.segWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={f => f.key}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.seg, filter === item.key && s.segOn]}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.segText, filter === item.key && s.segTextOn]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.key}
          contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>{error ?? 'Nothing here'}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const pill = STATUS_PILL[item.status]
            return (
              <TouchableOpacity
                style={s.row}
                activeOpacity={0.7}
                onPress={() => router.push(`/messages/${encodeURIComponent(item.key)}?smsEnabled=${smsEnabled ? '1' : '0'}`)}
                accessibilityRole="button"
                accessibilityLabel={`${item.displayName}${item.unread ? ', unread' : ''}, ${item.preview}`}
              >
                <View style={[s.avatar, { backgroundColor: avatarColor(item.key) }]}>
                  <Text style={s.avatarText}>{initials(item.displayName)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.rowTop}>
                    <Text style={s.name} numberOfLines={1}>{item.displayName}</Text>
                    <Text style={s.time}>{timeAgo(item.lastActivity)}</Text>
                  </View>
                  <Text style={s.preview} numberOfLines={1}>
                    <Text style={s.chIcon}>{SOURCE_ICON[item.source]} </Text>{item.preview}
                  </Text>
                  <View style={[s.pill, { backgroundColor: pill.bg, alignSelf: 'flex-start' }]}>
                    <Text style={[s.pillText, { color: pill.fg }]}>{pill.label}</Text>
                  </View>
                </View>
                {item.unread && <View style={s.unreadDot} />}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, backgroundColor: colors.surface },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.mut, marginTop: 2, marginBottom: 8 },
  segWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 10 },
  seg: { backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7 },
  segOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12.5, fontWeight: '600', color: colors.sub },
  segTextOn: { color: '#fff' },
  row: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 13,
    ...shadow.card,
  },
  avatar: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontWeight: '700', fontSize: 15, color: colors.ink, flexShrink: 1 },
  time: { fontSize: 11, color: colors.mut },
  preview: { fontSize: 13, color: colors.sub, marginTop: 2 },
  chIcon: { fontSize: 11 },
  pill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  pillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.mut, fontSize: 14 },
})
