import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon, type IconName } from '@/lib/icons'
import { supabase } from '@/lib/supabase'

const STATUS_COLOR: Record<string, string> = {
  draft:    '#6b7280',
  sent:     '#3b82f6',
  accepted: '#22c55e',
  declined: '#ef4444',
  expired:  '#9ca3af',
}

const STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  sent:     'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired:  'Expired',
}

type Quote = {
  id: string
  quote_number: string
  title: string
  status: string
  total: number
  customer_name: string | null
}

function formatAmount(amount: number) {
  return '$' + amount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function QuotesScreen() {
  const [search, setSearch] = useState('')
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchQuotes = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase
      .from('quotes')
      .select('id, quote_number, title, status, total, customers(name)')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(200)
    setQuotes(
      (data ?? []).map(q => ({
        id: q.id,
        quote_number: q.quote_number,
        title: q.title,
        status: q.status,
        total: q.total,
        customer_name: ((Array.isArray(q.customers) ? q.customers[0] : q.customers) as { name: string } | null)?.name ?? null,
      }))
    )
  }, [])

  useEffect(() => {
    fetchQuotes().finally(() => setIsLoading(false))
  }, [fetchQuotes])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchQuotes()
    setRefreshing(false)
  }, [fetchQuotes])

  const filtered = quotes.filter(q =>
    q.title.toLowerCase().includes(search.toLowerCase()) ||
    q.quote_number.toLowerCase().includes(search.toLowerCase()) ||
    (q.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Quotes</Text>
        <TouchableOpacity onPress={() => router.push('/quotes/new')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="plus-circle" size={26} color="#f97316" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Icon name="search" size={15} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search quotes…"
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={q => q.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{search ? 'No quotes match your search' : 'No quotes yet'}</Text>
              {!search && (
                <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/quotes/new')}>
                  <Text style={styles.createBtnText}>+ Create first quote</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: quote }) => {
            const color = STATUS_COLOR[quote.status] ?? '#9ca3af'
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/quotes/${quote.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.quoteNumber}>{quote.quote_number}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.statusText, { color }]}>
                      {STATUS_LABEL[quote.status] ?? quote.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.title} numberOfLines={1}>{quote.title}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.customer} numberOfLines={1}>
                    {quote.customer_name ?? '—'}
                  </Text>
                  <Text style={styles.amount}>{formatAmount(quote.total ?? 0)}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 4, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  quoteNumber: { fontSize: 12, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customer: { flex: 1, fontSize: 13, color: '#6b7280', marginRight: 8 },
  amount: { fontSize: 15, fontWeight: '700', color: '#111827' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 14 },
  emptyText: { color: '#6b7280', fontSize: 15 },
  createBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  createBtnText: { color: '#f97316', fontWeight: '700', fontSize: 14 },
})
