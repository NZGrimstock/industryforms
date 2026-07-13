import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Tabs, router } from 'expo-router'
import { Icon, type IconName } from '@/lib/icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { AUTO_CHECKIN_NOTICE_KEY, type AutoCheckinNotice } from '@/lib/location/tracking'


const ACTIVE_JOB_KEY = 'TRADIEE_ACTIVE_JOB'
type ActiveJob = { jobId: string; timesheetId: string; startedAt: string; source?: string }

async function readStoredJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    await AsyncStorage.removeItem(key)
    return null
  }
}

const BOTTOM_TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'home',     label: 'Home',     icon: 'home' },
  { name: 'jobs',     label: 'Jobs',     icon: 'briefcase' },
  { name: 'inbox',    label: 'Inbox',    icon: 'mail' },
  { name: 'schedule', label: 'Schedule', icon: 'calendar' },
  { name: 'more',     label: 'More',     icon: 'more-horizontal' },
]

const ADMIN_ONLY = new Set(['inbox'])

// Sticky timer badge — shown in every tab header when a job timer is running.
// Polls AsyncStorage every 8 s; tapping navigates back to the active job.
function ActiveTimerBadge() {
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    async function check() {
      setActiveJob(await readStoredJson<ActiveJob>(ACTIVE_JOB_KEY))
    }
    check()
    const poll = setInterval(check, 8000)
    return () => clearInterval(poll)
  }, [])

  useEffect(() => {
    if (!activeJob) { setElapsed(''); return }
    const tick = () => {
      const mins = Math.round((Date.now() - new Date(activeJob.startedAt).getTime()) / 60000)
      setElapsed(`${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [activeJob])

  if (!activeJob) return null

  return (
    <TouchableOpacity
      onPress={() => router.push(`/jobs/${activeJob.jobId}`)}
      style={timerStyles.badge}
      activeOpacity={0.75}
    >
      <View style={timerStyles.dot} />
      <Text style={timerStyles.label}>{elapsed || '…'}</Text>
    </TouchableOpacity>
  )
}

function AutoTimerNotice() {
  const [notice, setNotice] = useState<AutoCheckinNotice | null>(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    async function check() {
      setNotice(await readStoredJson<AutoCheckinNotice>(AUTO_CHECKIN_NOTICE_KEY))
    }
    check()
    const poll = setInterval(check, 4000)
    return () => clearInterval(poll)
  }, [])

  async function close() {
    await AsyncStorage.removeItem(AUTO_CHECKIN_NOTICE_KEY)
    setNotice(null)
  }

  async function viewJob() {
    if (!notice) return
    const jobId = notice.jobId
    await close()
    router.push(`/jobs/${jobId}`)
  }

  async function stopThisInstance() {
    if (!notice) return
    setStopping(true)
    try {
      const active = await readStoredJson<ActiveJob>(ACTIVE_JOB_KEY)
      const shouldClearActive = active?.timesheetId === notice.timesheetId

      const { error: deleteError } = await supabase
        .from('timesheets')
        .delete()
        .eq('id', notice.timesheetId)

      if (deleteError) {
        const { error: updateError } = await supabase
          .from('timesheets')
          .update({
            ended_at: notice.checkedInAt,
            is_billable: false,
            notes: 'Auto-started by GPS geo-fence, then declined by worker.',
          })
          .eq('id', notice.timesheetId)
        if (updateError) throw updateError
      }

      if (shouldClearActive) await AsyncStorage.removeItem(ACTIVE_JOB_KEY)
      await close()
    } catch (error) {
      Alert.alert('Could not stop timer', error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setStopping(false)
    }
  }

  if (!notice) return null

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={noticeStyles.overlay}>
        <View style={noticeStyles.card}>
          <TouchableOpacity style={noticeStyles.close} onPress={close} accessibilityLabel="Close auto timer notice">
            <Icon name="x" size={18} color="#6b7280" />
          </TouchableOpacity>
          <View style={noticeStyles.iconWrap}>
            <Icon name="map-pin" size={22} color="#15803d" />
          </View>
          <Text style={noticeStyles.title}>Job time tracking started</Text>
          <Text style={noticeStyles.jobNumber}>{notice.jobNumber}</Text>
          <Text style={noticeStyles.jobTitle} numberOfLines={2}>{notice.jobTitle}</Text>
          <Text style={noticeStyles.sub}>Auto tracking started this job timer because you arrived on site.</Text>
          <View style={noticeStyles.actions}>
            <TouchableOpacity style={noticeStyles.secondaryBtn} onPress={stopThisInstance} disabled={stopping}>
              {stopping ? <ActivityIndicator color="#c2410c" /> : <Text style={noticeStyles.secondaryText}>Don't track this time</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={noticeStyles.primaryBtn} onPress={viewJob} disabled={stopping}>
              <Text style={noticeStyles.primaryText}>View job</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const timerStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#dcfce7',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  label: { fontSize: 12, fontWeight: '700', color: '#15803d' },
})

const noticeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.32)',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 72,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  close: { position: 'absolute', top: 12, right: 12, padding: 6, zIndex: 2 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8 },
  jobNumber: { fontSize: 12, fontWeight: '800', color: '#15803d', letterSpacing: 0.5, textTransform: 'uppercase' },
  jobTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 3 },
  sub: { fontSize: 13, color: '#6b7280', lineHeight: 18, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryBtn: {
    flex: 1.2,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryText: { color: '#c2410c', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  primaryBtn: {
    flex: 0.8,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
})

export default function TabLayout() {
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadInbox, setUnreadInbox] = useState(0)
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    let inboxPoll: ReturnType<typeof setInterval> | null = null

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles').select('company_id, role').eq('id', session.user.id).single()
      if (!profile?.company_id) return
      const staff = profile.role === 'staff'
      setIsStaff(staff)
      const { count } = await supabase
        .from('job_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('subcontractor_company_id', profile.company_id)
        .eq('status', 'pending')
      setPendingCount(count ?? 0)

      if (!staff) {
        const loadUnread = async () => {
          const [msgs, enq] = await Promise.all([
            supabase.from('customer_messages').select('id', { count: 'exact', head: true })
              .eq('company_id', profile.company_id).eq('direction', 'inbound').is('read_at', null),
            supabase.from('enquiries').select('id', { count: 'exact', head: true })
              .eq('company_id', profile.company_id).eq('status', 'new'),
          ])
          setUnreadInbox((msgs.count ?? 0) + (enq.count ?? 0))
        }
        loadUnread()
        inboxPoll = setInterval(loadUnread, 15000)
      }
    }
    loadProfile()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadProfile())
    return () => { subscription.unsubscribe(); if (inboxPoll) clearInterval(inboxPoll) }
  }, [])

  const HeaderRight = useCallback(() => <ActiveTimerBadge />, [])

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerRight: HeaderRight,
        headerShadowVisible: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {BOTTOM_TABS.map(tab => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ color }) => (
              <View>
                <Icon name={tab.icon} size={22} color={color} />
                {tab.name === 'more' && pendingCount > 0 && (
                  <View style={styles.navBadge} />
                )}
                {tab.name === 'inbox' && unreadInbox > 0 && (
                  <View style={styles.navBadge} />
                )}
              </View>
            ),
            href: isStaff && ADMIN_ONLY.has(tab.name) ? null : undefined,
          }}
        />
      ))}
      {/* Routable (from More → Quotes) but not a bottom-tab button — see nav change in overhaul brief §6. */}
      <Tabs.Screen name="quotes" options={{ href: null }} />
    </Tabs>
    <AutoTimerNotice />
    </>
  )
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#ffffff' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  navBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
})
