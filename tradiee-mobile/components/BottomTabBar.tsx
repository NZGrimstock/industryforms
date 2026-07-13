// Persistent bottom nav bar, rendered once in the root layout (app/_layout.tsx)
// as a sibling of the root Stack — not the (tabs) group's own Tabs component,
// whose native bar is now hidden (tabBarStyle: { display: 'none' } in
// app/(tabs)/_layout.tsx). This is what makes the bar stay visible on every
// screen, including jobs/[id], quotes/[id], invoices/[id] and anything else —
// those are separate top-level Stack screens outside the (tabs) group and
// never had a bar at all under the old per-tab-native-bar approach.
//
// Uses router.dismissTo() rather than push/navigate: tapping a tab should
// collapse back down to that tab's existing screen in the stack (or replace
// if not present), not stack up a duplicate (tabs) instance every time you
// bounce between a pushed detail screen and the bar.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router, usePathname, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon, type IconName } from '@/lib/icons'
import { useNavStatus } from '@/lib/useNavStatus'

// href listed per-tab (rather than built from `name`) so each is a literal
// expo-router recognises under typedRoutes, not a template string it'd reject.
const TABS: { name: string; label: string; icon: IconName; href: Href }[] = [
  { name: 'home',     label: 'Home',     icon: 'home',            href: '/(tabs)/home' },
  { name: 'jobs',     label: 'Jobs',     icon: 'briefcase',       href: '/(tabs)/jobs' },
  { name: 'inbox',    label: 'Inbox',    icon: 'mail',            href: '/(tabs)/inbox' },
  { name: 'schedule', label: 'Schedule', icon: 'calendar',        href: '/(tabs)/schedule' },
  { name: 'more',     label: 'More',     icon: 'more-horizontal', href: '/(tabs)/more' },
]

// Matches pathnames whether or not they carry the "(tabs)" group segment —
// usePathname() and authored hrefs aren't always consistent about this.
function isActive(pathname: string, tabName: string) {
  const normalized = pathname.replace('/(tabs)', '')
  return normalized === `/${tabName}` || normalized.startsWith(`/${tabName}/`)
}

export function BottomTabBar() {
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const { isStaff, pendingCount, unreadInbox } = useNavStatus()

  const visibleTabs = TABS.filter(t => !(t.name === 'inbox' && isStaff))

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {visibleTabs.map(tab => {
        const active = isActive(pathname, tab.name)
        const color = active ? '#f97316' : '#9ca3af'
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            activeOpacity={0.7}
            onPress={() => router.dismissTo(tab.href)}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
          >
            <View>
              <Icon name={tab.icon} size={22} color={color} />
              {tab.name === 'more' && pendingCount > 0 && <View style={styles.badge} />}
              {tab.name === 'inbox' && unreadInbox > 0 && <View style={styles.badge} />}
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
})
