import { useCallback, useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Tabs, router } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

type FeatherName = React.ComponentProps<typeof Feather>['name']

// Tabs only owners/admins should see (sales/financial). Hidden for field staff.
const ADMIN_ONLY = new Set(['quotes', 'invoices'])

const TABS: { name: string; label: string; icon: FeatherName; shortLabel?: string }[] = [
  { name: 'jobs',        label: 'Jobs',        icon: 'briefcase' },
  { name: 'map',         label: 'Map',          icon: 'map' },
  { name: 'invitations', label: 'Invitations',  icon: 'mail' },
  { name: 'schedule',    label: 'Schedule',     icon: 'calendar' },
  { name: 'quotes',      label: 'Quotes',       icon: 'file-text' },
  { name: 'invoices',    label: 'Invoices',     icon: 'credit-card' },
  { name: 'customers',   label: 'Customers',    icon: 'users' },
  { name: 'timesheets',  label: 'Timesheets',   icon: 'clock', shortLabel: 'Time' },
  { name: 'more',        label: 'More',         icon: 'more-horizontal' },
]

function NavMenu({ visible, onClose, tabs }: { visible: boolean; onClose: () => void; tabs: typeof TABS }) {
  const topOffset = (Constants.statusBarHeight ?? 44) + 56

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.menu, { top: topOffset }]} onPress={() => {}}>
          {tabs.filter(t => t.name !== 'more').map((tab, i, arr) => (
            <TouchableOpacity
              key={tab.name}
              style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]}
              onPress={() => { onClose(); router.navigate(`/(tabs)/${tab.name}` as never) }}
              activeOpacity={0.6}
            >
              <Feather name={tab.icon} size={18} color="#6b7280" />
              <Text style={styles.menuLabel}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default function TabLayout() {
  const [pendingCount, setPendingCount] = useState(0)
  const [menuVisible, setMenuVisible] = useState(false)
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    async function loadBadge() {
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
    loadBadge()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadBadge())
    return () => subscription.unsubscribe()
  }, [])

  // Staff don't get the sales/financial tabs.
  const visibleTabs = isStaff ? TABS.filter(t => !ADMIN_ONLY.has(t.name)) : TABS

  const HeaderLeft = useCallback(() => (
    <TouchableOpacity
      onPress={() => setMenuVisible(v => !v)}
      style={styles.headerBtn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather name="menu" size={22} color="#374151" />
    </TouchableOpacity>
  ), [])

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
          headerLeft: HeaderLeft,
          headerShadowVisible: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#f97316',
          tabBarInactiveTintColor: '#9ca3af',
          tabBarShowLabel: true,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        {TABS.map(tab => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarLabel: tab.shortLabel ?? tab.label,
              tabBarIcon: ({ color }) => <Feather name={tab.icon} size={22} color={color} />,
              tabBarBadge: tab.name === 'invitations' && pendingCount > 0
                ? (pendingCount > 99 ? '99+' : pendingCount)
                : undefined,
              // Hide (but keep route registered) for field staff.
              href: isStaff && ADMIN_ONLY.has(tab.name) ? null : undefined,
            }}
          />
        ))}
      </Tabs>
      <NavMenu visible={menuVisible} onClose={() => setMenuVisible(false)} tabs={visibleTabs} />
    </>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  headerBtn: {
    paddingLeft: 16,
    paddingVertical: 8,
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  menu: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
})
