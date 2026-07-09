import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import { router, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useTimezone } from '@/lib/profile-context'
import { formatDate as formatDateTz } from '@/lib/datetime'

const STATUS_COLOR: Record<string, string> = {
  draft:          '#6b7280',
  sent:           '#3b82f6',
  partially_paid: '#f97316',
  paid:           '#22c55e',
  overdue:        '#ef4444',
  void:           '#9ca3af',
}

const STATUS_LABEL: Record<string, string> = {
  draft:          'Draft',
  sent:           'Sent',
  partially_paid: 'Partial',
  paid:           'Paid',
  overdue:        'Overdue',
  void:           'Void',
}

type Invoice = {
  id: string
  invoice_number: string
  status: string
  total: number
  due_date: string | null
  job_title: string | null
}

function formatAmount(amount: number) {
  return '$' + (amount ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function InvoicesScreen() {
  const timezone = useTimezone()
  const formatDate = (iso: string | null) => iso ? formatDateTz(iso, timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  const [search, setSearch] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total, due_date, jobs(title)')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })
      .limit(200)
    setInvoices(
      (data ?? []).map(i => ({
        id: i.id,
        invoice_number: i.invoice_number,
        status: i.status,
        total: i.total,
        due_date: i.due_date,
        job_title: ((Array.isArray(i.jobs) ? i.jobs[0] : i.jobs) as { title: string } | null)?.title ?? null,
      }))
    )
  }, [])

  useEffect(() => {
    fetchInvoices().finally(() => setIsLoading(false))
  }, [fetchInvoices])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchInvoices()
    setRefreshing(false)
  }, [fetchInvoices])

  const filtered = invoices.filter(i =>
    i.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (i.job_title ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Invoices', headerTintColor: '#f97316' }} />
      <View style={styles.header}>
        <Text style={styles.count}>{filtered.length} invoice{filtered.length === 1 ? '' : 's'}</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search invoices…"
          placeholderTextColor="#9ca3af"
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
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{search ? 'No invoices match your search' : 'No invoices yet'}</Text>
            </View>
          }
          renderItem={({ item: invoice }) => {
            const color = STATUS_COLOR[invoice.status] ?? '#9ca3af'
            const dueStr = formatDate(invoice.due_date)
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/invoices/${invoice.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.statusText, { color }]}>
                      {STATUS_LABEL[invoice.status] ?? invoice.status}
                    </Text>
                  </View>
                </View>
                {invoice.job_title && (
                  <Text style={styles.jobTitle} numberOfLines={1}>{invoice.job_title}</Text>
                )}
                <View style={styles.cardFooter}>
                  {dueStr ? (
                    <Text style={styles.dueDate}>Due {dueStr}</Text>
                  ) : (
                    <View />
                  )}
                  <Text style={styles.amount}>{formatAmount(invoice.total ?? 0)}</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  count: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 4, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, height: 44 },
  searchIcon: { marginRight: 8, fontSize: 14 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  invoiceNumber: { fontSize: 12, color: '#9ca3af', fontWeight: '600', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  jobTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dueDate: { fontSize: 13, color: '#6b7280' },
  amount: { fontSize: 15, fontWeight: '700', color: '#111827' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
})
