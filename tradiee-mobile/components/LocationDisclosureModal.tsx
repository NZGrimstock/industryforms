import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Icon } from '@/lib/icons'

// Google Play "Prominent Disclosure and Consent" screen. Must appear IN-APP,
// before the background-location permission request, describe the data + why,
// and require an affirmative tap to consent. Do not weaken this copy — the app
// was rejected for requesting BACKGROUND_LOCATION without it.
export function LocationDisclosureModal({ visible, onAllow, onDeny }: {
  visible: boolean
  onAllow: () => void
  onDeny: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDeny}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}><Icon name="map-pin" size={28} color="#f97316" /></View>
          <Text style={styles.title}>Allow location tracking</Text>
          <ScrollView style={styles.bodyScroll} contentContainerStyle={{ paddingBottom: 4 }}>
            <Text style={styles.body}>
              IndustryForms collects location data to power the vehicle travel logbook (recording
              your trip start/end points and distance) and to show your assigned jobs on the map —
              <Text style={styles.bold}> even when the app is closed or not in use.</Text>
            </Text>
            <Text style={styles.body}>
              Tracking only runs while you have this feature switched on, and your trips are visible
              to your company&apos;s administrators. You can turn it off at any time here or in your
              device settings.
            </Text>
            <Text style={styles.bodyMuted}>
              See our Privacy Policy for how we handle location data.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.allowBtn} onPress={onAllow} activeOpacity={0.85}>
            <Text style={styles.allowText}>Allow</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.denyBtn} onPress={onDeny} activeOpacity={0.7}>
            <Text style={styles.denyText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  iconWrap: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 12 },
  bodyScroll: { maxHeight: 260 },
  body: { fontSize: 14, lineHeight: 21, color: '#374151', marginBottom: 12 },
  bodyMuted: { fontSize: 13, lineHeight: 19, color: '#6b7280' },
  bold: { fontWeight: '700', color: '#111827' },
  allowBtn: { backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  allowText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  denyBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  denyText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
})
