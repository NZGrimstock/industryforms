import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import { router, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

type Customer = {
  id: string
  name: string
  type: string
  contact_person: string | null
  email: string | null
  phone: string | null
}

const TYPE_COLOR: Record<string, string> = {
  commercial:  '#3b82f6',
  residential: '#22c55e',
}

export default function CustomersScreen() {
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchCustomers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase
      .from('customers')
      .select('id, name, type, contact_person, email, phone')
      .eq('company_id', profile.company_id)
      .order('name')
      .limit(200)
    setCustomers(data ?? [])
  }, [])

  useEffect(() => {
    fetchCustomers().finally(() => setIsLoading(false))
  }, [fetchCustomers])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchCustomers()
    setRefreshing(false)
  }, [fetchCustomers])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_person ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function initials(name: string) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Customers', headerTintColor: '#f97316' }} />
      <View style={styles.header}>
        <Text style={styles.count}>{filtered.length} customer{filtered.length === 1 ? '' : 's'}</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers…"
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
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{search ? 'No customers match' : 'No customers yet'}</Text>
            </View>
          }
          renderItem={({ item: customer }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/customers/${customer.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(customer.name)}</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{customer.name}</Text>
                  <View style={[styles.typeBadge, { backgroundColor: (TYPE_COLOR[customer.type] ?? '#9ca3af') + '20' }]}>
                    <Text style={[styles.typeText, { color: TYPE_COLOR[customer.type] ?? '#9ca3af' }]}>
                      {customer.type ?? 'unknown'}
                    </Text>
                  </View>
                </View>
                {customer.contact_person && (
                  <Text style={styles.contactPerson} numberOfLines={1}>{customer.contact_person}</Text>
                )}
                {customer.phone && (
                  <Text style={styles.detail}>📞 {customer.phone}</Text>
                )}
                {customer.email && (
                  <Text style={styles.detail} numberOfLines={1}>✉️ {customer.email}</Text>
                )}
              </View>
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
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#f97316' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827' },
  typeBadge: { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  typeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  contactPerson: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  detail: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
})
