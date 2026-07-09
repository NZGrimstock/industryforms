import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useTimezone } from '@/lib/profile-context'
import { formatTime, formatDate } from '@/lib/datetime'

const ACTIVE_JOB_KEY = 'TRADIEE_ACTIVE_JOB'
type ActiveJob = { jobId: string; timesheetId: string; startedAt: string }

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const VISIT_COLOR: Record<string, string> = {
  scheduled: '#3b82f6',
  in_progress: '#f97316',
  completed: '#22c55e',
  cancelled: '#ef4444',
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#9ca3af',
}

type Visit = {
  id: string
  scheduled_start: string
  scheduled_end: string | null
  status: string
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
}

type Todo = {
  id: string
  title: string
  priority: string
  job_id: string | null
}

type Stats = { openJobs: number; draftQuotes: number; pendingTodos: number }
type MoneySnapshot = { collectedThisWeek: number; outstanding: number }

export default function HomeScreen() {
  const timezone = useTimezone()
  const [firstName, setFirstName] = useState('')
  const [visits, setVisits] = useState<Visit[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [stats, setStats] = useState<Stats>({ openJobs: 0, draftQuotes: 0, pendingTodos: 0 })
  const [money, setMoney] = useState<MoneySnapshot | null>(null)
  const [activeJob, setActiveJob] = useState<(ActiveJob & { elapsed: string }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const checkTimer = useCallback(async () => {
    const raw = await AsyncStorage.getItem(ACTIVE_JOB_KEY)
    if (!raw) { setActiveJob(null); return }
    const aj: ActiveJob = JSON.parse(raw)
    const mins = Math.round((Date.now() - new Date(aj.startedAt).getTime()) / 60000)
    setActiveJob({ ...aj, elapsed: `${Math.floor(mins / 60)}h ${mins % 60}m` })
  }, [])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase
      .from('profiles').select('full_name, company_id, role').eq('id', user.id).single()
    if (!prof) return
    setFirstName(prof.full_name?.split(' ')[0] ?? '')

    const today = new Date().toISOString().slice(0, 10)
    const { data: assignments } = await supabase
      .from('job_assignees')
      .select('job_id')
      .eq('profile_id', user.id)
    const secondaryJobIds = [...new Set((assignments ?? []).map(a => a.job_id as string).filter(Boolean))]

    let visitsQuery = supabase.from('job_visits')
      .select('id, scheduled_start, scheduled_end, status, job_id, jobs!job_id(job_number, title, customers(name))')
      .gte('scheduled_start', `${today}T00:00:00.000Z`)
      .lte('scheduled_start', `${today}T23:59:59.999Z`)
      .neq('status', 'cancelled')
      .order('scheduled_start')
    visitsQuery = secondaryJobIds.length > 0
      ? visitsQuery.or(`assigned_to.eq.${user.id},job_id.in.(${secondaryJobIds.join(',')})`)
      : visitsQuery.eq('assigned_to', user.id)

    const [visitsRes, todosRes, openJobsRes, draftQuotesRes, pendingTodosRes] = await Promise.all([
      visitsQuery,
      supabase.from('todos')
        .select('id, title, priority, job_id')
        .eq('assigned_to', user.id)
        .eq('status', 'pending')
        .lte('due_date', today)
        .order('due_date')
        .limit(6),
      supabase.from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', prof.company_id)
        .in('status', ['unscheduled', 'scheduled', 'in_progress']),
      supabase.from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', prof.company_id)
        .eq('status', 'accepted'),
      supabase.from('todos')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .eq('status', 'pending'),
    ])

    setVisits(
      (visitsRes.data ?? []).map(v => {
        const job = (Array.isArray(v.jobs) ? v.jobs[0] : v.jobs) as any
        const cust = job?.customers ? (Array.isArray(job.customers) ? job.customers[0] : job.customers) : null
        return {
          id: v.id,
          scheduled_start: v.scheduled_start as string,
          scheduled_end: v.scheduled_end as string | null,
          status: v.status as string,
          job_id: v.job_id as string,
          job_number: job?.job_number ?? '',
          job_title: job?.title ?? '',
          customer_name: cust?.name ?? null,
        }
      })
    )
    setTodos((todosRes.data ?? []) as Todo[])
    setStats({
      openJobs: openJobsRes.count ?? 0,
      draftQuotes: draftQuotesRes.count ?? 0, // now "accepted quotes"
      pendingTodos: pendingTodosRes.count ?? 0,
    })

    // Money snapshot — owner/admin only (matches Quotes-tab gating; staff
    // never see financials on mobile).
    if (prof.role === 'owner' || prof.role === 'admin') {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      weekStart.setHours(0, 0, 0, 0)

      const [paymentsRes, invoicesRes] = await Promise.all([
        supabase.from('payments')
          .select('amount, invoices!inner(company_id)')
          .eq('invoices.company_id', prof.company_id)
          .gte('paid_at', weekStart.toISOString()),
        supabase.from('invoices')
          .select('total, amount_paid')
          .eq('company_id', prof.company_id)
          .in('status', ['sent', 'partially_paid', 'overdue']),
      ])
      const collectedThisWeek = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
      const outstanding = (invoicesRes.data ?? []).reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.amount_paid)), 0)
      setMoney({ collectedThisWeek, outstanding })
    } else {
      setMoney(null)
    }
  }, [])

  useFocusEffect(useCallback(() => { checkTimer() }, [checkTimer]))

  useEffect(() => {
    Promise.all([load(), checkTimer()]).finally(() => setLoading(false))
  }, [load, checkTimer])

  async function onRefresh() {
    setRefreshing(true)
    await Promise.all([load(), checkTimer()])
    setRefreshing(false)
  }

  async function completeTodo(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id))
    await supabase.from('todos').update({ status: 'done' }).eq('id', id)
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
      >
        {/* Greeting */}
        <Text style={s.greeting}>{getGreeting()}{firstName ? `, ${firstName}` : ''}!</Text>
        <Text style={s.date}>
          {formatDate(new Date(), timezone, { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>

        {/* Active job banner */}
        {activeJob && (
          <TouchableOpacity
            style={s.timerBanner}
            onPress={() => router.push(`/jobs/${activeJob.jobId}`)}
            activeOpacity={0.85}
          >
            <View style={s.timerDot} />
            <View style={{ flex: 1 }}>
              <Text style={s.timerLabel}>Job timer running</Text>
              <Text style={s.timerSub}>{activeJob.elapsed} elapsed — tap to stop</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#15803d" />
          </TouchableOpacity>
        )}

        {/* Stats */}
        <View style={s.statsRow}>
          <TouchableOpacity style={s.statCard} onPress={() => router.push('/(tabs)/jobs')} activeOpacity={0.7}>
            <Text style={s.statNum}>{stats.openJobs}</Text>
            <Text style={s.statLbl}>Open jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.statCard} onPress={() => router.push('/(tabs)/quotes')} activeOpacity={0.7}>
            <Text style={s.statNum}>{stats.draftQuotes}</Text>
            <Text style={s.statLbl}>Accepted quotes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.statCard} onPress={() => router.push('/todos' as never)} activeOpacity={0.7}>
            <Text style={[s.statNum, stats.pendingTodos > 0 && { color: '#f97316' }]}>{stats.pendingTodos}</Text>
            <Text style={s.statLbl}>To-dos</Text>
          </TouchableOpacity>
        </View>

        {/* Money snapshot */}
        {money && (
          <View style={s.moneyRow}>
            <TouchableOpacity style={s.moneyCard} onPress={() => router.push('/invoices')} activeOpacity={0.7}>
              <Text style={s.moneyLbl}>Collected this week</Text>
              <Text style={[s.moneyNum, { color: '#15803d' }]}>${money.collectedThisWeek.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.moneyCard} onPress={() => router.push('/invoices')} activeOpacity={0.7}>
              <Text style={s.moneyLbl}>Outstanding</Text>
              <Text style={[s.moneyNum, money.outstanding > 0 && { color: '#f97316' }]}>${money.outstanding.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick actions */}
        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/jobs/new')} activeOpacity={0.8}>
            <Feather name="plus" size={17} color="#fff" />
            <Text style={s.quickBtnText}>New Job</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.quickBtn, s.quickBtnGhost]} onPress={() => router.push('/quotes/new')} activeOpacity={0.8}>
            <Feather name="plus" size={17} color="#f97316" />
            <Text style={[s.quickBtnText, { color: '#f97316' }]}>New Quote</Text>
          </TouchableOpacity>
        </View>

        {/* Today's visits */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Today's visits</Text>
          {visits.length === 0 ? (
            <Text style={s.empty}>No visits scheduled for today</Text>
          ) : (
            visits.map(v => (
              <TouchableOpacity
                key={v.id}
                style={s.visitRow}
                onPress={() => router.push(`/jobs/${v.job_id}`)}
                activeOpacity={0.7}
              >
                <View style={[s.visitStripe, { backgroundColor: VISIT_COLOR[v.status] ?? '#9ca3af' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.visitTime}>
                    {formatTime(v.scheduled_start, timezone)}{v.scheduled_end ? ` – ${formatTime(v.scheduled_end, timezone)}` : ''}
                  </Text>
                  <Text style={s.visitTitle} numberOfLines={1}>{v.job_title}</Text>
                  {v.customer_name && <Text style={s.visitCustomer}>{v.customer_name}</Text>}
                </View>
                <Text style={s.visitNum}>{v.job_number}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* To-dos */}
        {todos.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>To-do today</Text>
              <TouchableOpacity onPress={() => router.push('/todos' as never)}>
                <Text style={s.seeAll}>See all →</Text>
              </TouchableOpacity>
            </View>
            {todos.map(t => (
              <View key={t.id} style={s.todoRow}>
                <TouchableOpacity onPress={() => completeTodo(t.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="square" size={20} color="#d1d5db" />
                </TouchableOpacity>
                <Text style={s.todoTitle} numberOfLines={1}>{t.title}</Text>
                <View style={[s.prioBadge, { backgroundColor: (PRIORITY_COLOR[t.priority] ?? '#9ca3af') + '20' }]}>
                  <Text style={[s.prioText, { color: PRIORITY_COLOR[t.priority] ?? '#9ca3af' }]}>{t.priority}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  greeting: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 2 },
  date: { fontSize: 14, color: '#9ca3af', marginBottom: 18 },
  timerBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dcfce7', borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 },
  timerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  timerLabel: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  timerSub: { fontSize: 12, color: '#16a34a', marginTop: 1 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  statNum: { fontSize: 26, fontWeight: '800', color: '#111827' },
  statLbl: { fontSize: 11, color: '#9ca3af', fontWeight: '500', marginTop: 2, textAlign: 'center' },
  moneyRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  moneyCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  moneyLbl: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  moneyNum: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 3 },
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 13 },
  quickBtnGhost: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  quickBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  seeAll: { fontSize: 13, color: '#f97316', fontWeight: '600', marginBottom: 10 },
  empty: { color: '#d1d5db', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  visitStripe: { width: 3, height: 40, borderRadius: 2 },
  visitTime: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  visitTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  visitCustomer: { fontSize: 12, color: '#6b7280' },
  visitNum: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  todoTitle: { flex: 1, fontSize: 14, color: '#374151' },
  prioBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  prioText: { fontSize: 11, fontWeight: '600' },
})
