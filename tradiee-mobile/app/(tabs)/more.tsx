import { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'

type FeatherName = React.ComponentProps<typeof Feather>['name']

type MenuItem = {
  icon: FeatherName
  label: string
  route: string
  badge?: number
}

export default function MoreScreen() {
  const [profile, setProfile] = useState<{ full_name: string | null; email: string; role: string } | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [projectsEnabled, setProjectsEnabled] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('full_name, role, company_id, companies(addons, billing_exempt)').eq('id', user.id).single()
        .then(async ({ data }) => {
          setProfile({ full_name: data?.full_name ?? null, email: user.email ?? '', role: data?.role ?? '' })
          const company = data?.companies as { addons?: Record<string, { active?: boolean }> | null; billing_exempt?: boolean | null } | null
          setProjectsEnabled(company?.billing_exempt === true || company?.addons?.projects?.active === true)
          if (data?.company_id) {
            const { count } = await supabase.from('job_invitations')
              .select('id', { count: 'exact', head: true })
              .eq('subcontractor_company_id', data.company_id)
              .eq('status', 'pending')
            setPendingCount(count ?? 0)
          }
        })
    })
  }, [])

  async function signOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/login')
        },
      },
    ])
  }

  const workItems: MenuItem[] = [
    { icon: 'users',       label: 'Customers',   route: '/customers' },
    ...(projectsEnabled ? [{ icon: 'folder' as FeatherName, label: 'Projects', route: '/projects' }] : []),
    ...(profile?.role !== 'staff' ? [{ icon: 'file-text' as FeatherName, label: 'Quotes', route: '/quotes' }] : []),
    { icon: 'credit-card', label: 'Invoices',     route: '/invoices' },
    { icon: 'zap',         label: 'Tap to Pay',   route: '/pay-now' },
    { icon: 'clock',       label: 'Time Logs',    route: '/timesheets' },
    { icon: 'map',         label: 'Job Map',      route: '/job-map' },
    { icon: 'check-square',label: 'To-do List',   route: '/todos' },
    { icon: 'mail',        label: 'Invitations',  route: '/invitations', badge: pendingCount > 0 ? pendingCount : undefined },
  ]

  const accountItems: MenuItem[] = [
    { icon: 'user',    label: 'My Profile',     route: '/profile' },
    { icon: 'bell',    label: 'Notifications',  route: '/notifications' },
  ]

  function Row({ item }: { item: MenuItem }) {
    return (
      <TouchableOpacity
        style={s.row}
        onPress={() => router.push(item.route as never)}
        activeOpacity={0.6}
      >
        <View style={s.iconWrap}>
          <Feather name={item.icon} size={18} color="#6b7280" />
        </View>
        <Text style={s.rowLabel}>{item.label}</Text>
        {item.badge ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
          </View>
        ) : null}
        <Feather name="chevron-right" size={16} color="#d1d5db" />
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 40 }}>

        {profile && (
          <TouchableOpacity style={s.profileCard} onPress={() => router.push('/profile' as never)} activeOpacity={0.8}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {(profile.full_name ?? profile.email)[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              {profile.full_name && <Text style={s.profileName}>{profile.full_name}</Text>}
              <Text style={s.profileEmail}>{profile.email}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#d1d5db" />
          </TouchableOpacity>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Work</Text>
          {workItems.map(item => <Row key={item.label} item={item} />)}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          {accountItems.map(item => <Row key={item.label} item={item} />)}
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={signOut} activeOpacity={0.8}>
          <Feather name="log-out" size={16} color="#ef4444" />
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#f97316' },
  profileName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  profileEmail: { fontSize: 13, color: '#6b7280' },
  section: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase',
    letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f3f4f6', gap: 12,
  },
  iconWrap: { width: 28, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  badge: {
    backgroundColor: '#f97316', borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginRight: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 15, marginTop: 8,
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 16 },
})
