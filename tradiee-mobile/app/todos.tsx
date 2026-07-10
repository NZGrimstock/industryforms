import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Stack, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'

type Todo = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  job_id: string | null
  is_auto: boolean
  due_date: string | null
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#9ca3af',
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export default function TodosScreen() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [adding, setAdding] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (prof) setCompanyId(prof.company_id)
    const { data } = await supabase.from('todos')
      .select('id, title, description, priority, status, job_id, is_auto, due_date')
      .eq('assigned_to', user.id)
      .eq('status', 'pending')
      .limit(100)
    const sorted = (data ?? []).sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    )
    setTodos(sorted as Todo[])
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function complete(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id))
    await supabase.from('todos').update({ status: 'done' }).eq('id', id)
  }

  async function addTodo() {
    if (!newTitle.trim() || !userId || !companyId) return
    setAdding(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.from('todos').insert({
      title: newTitle.trim(),
      company_id: companyId,
      assigned_to: userId,
      priority: newPriority,
      status: 'pending',
      due_date: today,
      is_auto: false,
    }).select('id, title, description, priority, status, job_id, is_auto, due_date').single()
    setAdding(false)
    if (error) { Alert.alert('Error', error.message); return }
    if (data) setTodos(prev => [data as Todo, ...prev])
    setNewTitle('')
    setNewPriority('medium')
    setShowAdd(false)
  }

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen
        options={{
          title: 'To-do List',
          headerTintColor: '#f97316',
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowAdd(true)} style={{ marginRight: 16 }}>
              <Feather name="plus" size={24} color="#f97316" />
            </TouchableOpacity>
          ),
        }}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#f97316" />
      ) : (
        <FlatList
          data={todos}
          keyExtractor={t => t.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="check-circle" size={40} color="#d1d5db" />
              <Text style={s.emptyText}>All clear — nothing pending!</Text>
              <TouchableOpacity onPress={() => setShowAdd(true)} style={s.addPromptBtn}>
                <Text style={s.addPromptText}>+ Add a to-do</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <TouchableOpacity
                onPress={() => complete(item.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="square" size={22} color="#d1d5db" />
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={item.job_id ? () => router.push(`/jobs/${item.job_id}`) : undefined}
                activeOpacity={item.job_id ? 0.7 : 1}
              >
                <Text style={s.todoTitle}>{item.title}</Text>
                {item.description ? (
                  <Text style={s.todoDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                {item.is_auto && (
                  <Text style={s.autoLabel}>Auto-generated</Text>
                )}
              </TouchableOpacity>
              <View style={[s.prioBadge, { backgroundColor: (PRIORITY_COLOR[item.priority] ?? '#9ca3af') + '20' }]}>
                <Text style={[s.prioText, { color: PRIORITY_COLOR[item.priority] ?? '#9ca3af' }]}>
                  {item.priority}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Add To-do</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={s.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ padding: 16, gap: 14 }}>
            <TextInput
              style={[s.input, { minHeight: 64, textAlignVertical: 'top', paddingTop: 12 }]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="What needs to be done?"
              placeholderTextColor="#6b7280"
              autoFocus
              multiline
            />
            <Text style={s.label}>Priority</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    s.prioBtn,
                    newPriority === p && {
                      backgroundColor: (PRIORITY_COLOR[p]) + '20',
                      borderColor: PRIORITY_COLOR[p],
                    },
                  ]}
                  onPress={() => setNewPriority(p)}
                >
                  <Text style={[s.prioBtnText, newPriority === p && { color: PRIORITY_COLOR[p] }]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[s.addBtn, (!newTitle.trim() || adding) && { opacity: 0.5 }]}
              onPress={addTodo}
              disabled={!newTitle.trim() || adding}
              activeOpacity={0.85}
            >
              {adding ? <ActivityIndicator color="#fff" /> : <Text style={s.addBtnText}>Add To-do</Text>}
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  todoTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  todoDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  autoLabel: { fontSize: 11, color: '#6b7280', marginTop: 3, fontStyle: 'italic' },
  prioBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  prioText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 15 },
  addPromptBtn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  addPromptText: { color: '#f97316', fontWeight: '700', fontSize: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  prioBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  prioBtnText: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'capitalize' },
  addBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
