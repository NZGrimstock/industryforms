import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Modal, RefreshControl, Linking,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { Stack, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useTimezone } from '@/lib/profile-context'
import { formatDate } from '@/lib/datetime'

type Enquiry = {
  id: string
  customer_name: string
  status: string
  created_at: string
  phone: string | null
  email: string | null
  notes: string | null
  source: string | null
}

const STATUS_COLOR: Record<string, string> = {
  new:       '#3b82f6',
  contacted: '#f97316',
  quoted:    '#8b5cf6',
  won:       '#22c55e',
  lost:      '#ef4444',
}

export default function EnquiriesScreen() {
  const timezone = useTimezone()
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', source: '' })
  const [adding, setAdding] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'active' | 'all'>('active')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!prof) return
    setCompanyId(prof.company_id)
    let q = supabase.from('enquiries')
      .select('id, customer_name, status, created_at, phone, email, notes, source')
      .eq('company_id', prof.company_id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter === 'active') q = q.in('status', ['new', 'contacted'])
    const { data } = await q
    setEnquiries((data ?? []) as Enquiry[])
  }, [filter])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function addEnquiry() {
    if (!form.name.trim() || !companyId || !userId) return
    setAdding(true)
    const { data, error } = await supabase.from('enquiries').insert({
      company_id: companyId,
      assigned_to: userId,
      customer_name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      source: form.source.trim() || 'mobile',
      status: 'new',
    }).select('id, customer_name, status, created_at, phone, email, notes, source').single()
    setAdding(false)
    if (error) { Alert.alert('Error', error.message); return }
    if (data) setEnquiries(prev => [data as Enquiry, ...prev])
    setForm({ name: '', phone: '', email: '', notes: '', source: '' })
    setShowAdd(false)
  }

  async function setStatus(id: string, status: string) {
    setEnquiries(prev => prev.map(e => e.id === id ? { ...e, status } : e))
    await supabase.from('enquiries').update({ status }).eq('id', id)
  }

  async function convertToQuote(e: Enquiry) {
    router.push(`/quotes/new`)
  }

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen
        options={{
          title: 'Enquiries',
          headerTintColor: '#f97316',
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowAdd(true)} style={{ marginRight: 16 }}>
              <Feather name="plus" size={24} color="#f97316" />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={s.filterRow}>
        {(['active', 'all'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f === 'active' ? 'Active' : 'All'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
      ) : (
        <FlatList
          data={enquiries}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>{filter === 'active' ? 'No active enquiries' : 'No enquiries yet'}</Text>
              <TouchableOpacity style={s.addPromptBtn} onPress={() => setShowAdd(true)}>
                <Text style={s.addPromptText}>+ Log an enquiry</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.customer_name}</Text>
                  {item.phone && (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.phone!.replace(/[^+\d]/g, '')}`)}>
                      <Text style={s.phone}>{item.phone}</Text>
                    </TouchableOpacity>
                  )}
                  {item.notes && <Text style={s.notes} numberOfLines={2}>{item.notes}</Text>}
                  <Text style={s.source}>{item.source ?? 'Direct'} · {formatDate(item.created_at, timezone)}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? '#9ca3af') + '20' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? '#9ca3af' }]}>{item.status}</Text>
                </View>
              </View>

              {item.status !== 'won' && item.status !== 'lost' && (
                <View style={s.actions}>
                  {item.status === 'new' && (
                    <TouchableOpacity style={s.actionBtn} onPress={() => setStatus(item.id, 'contacted')}>
                      <Text style={s.actionText}>Contacted</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.actionBtn} onPress={() => convertToQuote(item)}>
                    <Text style={s.actionText}>Quote</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#dcfce7' }]} onPress={() => setStatus(item.id, 'won')}>
                    <Text style={[s.actionText, { color: '#15803d' }]}>Won ✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#fee2e2' }]} onPress={() => setStatus(item.id, 'lost')}>
                    <Text style={[s.actionText, { color: '#b91c1c' }]}>Lost</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>New Enquiry</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={s.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
              <TextInput style={s.input} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} placeholder="Customer name *" placeholderTextColor="#9ca3af" autoFocus />
              <TextInput style={s.input} value={form.phone} onChangeText={v => setForm(p => ({ ...p, phone: v }))} placeholder="Phone" placeholderTextColor="#9ca3af" keyboardType="phone-pad" />
              <TextInput style={s.input} value={form.email} onChangeText={v => setForm(p => ({ ...p, email: v }))} placeholder="Email" placeholderTextColor="#9ca3af" keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }]} value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} placeholder="What are they looking for?" placeholderTextColor="#9ca3af" multiline />
              <TextInput style={s.input} value={form.source} onChangeText={v => setForm(p => ({ ...p, source: v }))} placeholder="Source (phone call, website, referral…)" placeholderTextColor="#9ca3af" />
              <TouchableOpacity
                style={[s.addBtn, (!form.name.trim() || adding) && { opacity: 0.5 }]}
                onPress={addEnquiry}
                disabled={!form.name.trim() || adding}
                activeOpacity={0.85}
              >
                {adding ? <ActivityIndicator color="#fff" /> : <Text style={s.addBtnText}>Add Enquiry</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  filterRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 3 },
  filterBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  filterBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  filterText: { fontSize: 13, fontWeight: '500', color: '#9ca3af' },
  filterTextActive: { color: '#111827', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 16, fontWeight: '700', color: '#111827' },
  phone: { fontSize: 13, color: '#f97316', marginTop: 2 },
  notes: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  source: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  badge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f9fafb', flexWrap: 'wrap' },
  actionBtn: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  actionText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  addPromptBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  addPromptText: { color: '#f97316', fontWeight: '700', fontSize: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  addBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
