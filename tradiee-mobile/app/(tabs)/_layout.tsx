import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Tabs, router } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'

type FeatherName = React.ComponentProps<typeof Feather>['name']

const ACTIVE_JOB_KEY = 'TRADIEE_ACTIVE_JOB'
type ActiveJob = { jobId: string; timesheetId: string; startedAt: string }

const BOTTOM_TABS: { name: string; label: string; icon: FeatherName }[] = [
  { name: 'home',     label: 'Home',     icon: 'home' },
  { name: 'jobs',     label: 'Jobs',     icon: 'briefcase' },
  { name: 'schedule', label: 'Schedule', icon: 'calendar' },
  { name: 'quotes',   label: 'Quotes',   icon: 'file-text' },
  { name: 'more',     label: 'More',     icon: 'more-horizontal' },
]

const ADMIN_ONLY = new Set(['quotes'])

// Sticky timer badge — shown in every tab header when a job timer is running.
// Polls AsyncStorage every 8 s; tapping navigates back to the active job.
function ActiveTimerBadge() {
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    async function check() {
      const raw = await AsyncStorage.getItem(ACTIVE_JOB_KEY)
      setActiveJob(raw ? JSON.parse(raw) : null)
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

export default function TabLayout() {
  const [pendingCount, setPendingCount] = useState(0)
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles').select('company_id, role').eq('id', session.user.id).single()
      if (!profile?.company_id) return
      setIsStaff(profile.role === 'staff')
      const { count } = await supabase
        .from('job_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('subcontractor_company_id', profile.company_id)
        .eq('status', 'pending')
      setPendingCount(count ?? 0)
    }
    loadProfile()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadProfile())
    return () => subscription.unsubscribe()
  }, [])

  const HeaderRight = useCallback(() => <ActiveTimerBadge />, [])

  return (
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
                <Feather name={tab.icon} size={22} color={color} />
                {tab.name === 'more' && pendingCount > 0 && (
                  <View style={styles.navBadge} />
                )}
              </View>
            ),
            href: isStaff && ADMIN_ONLY.has(tab.name) ? null : undefined,
          }}
        />
      ))}
    </Tabs>
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
