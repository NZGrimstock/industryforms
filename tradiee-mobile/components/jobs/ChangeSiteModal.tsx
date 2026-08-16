import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform, KeyboardAvoidingView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { Icon } from '@/lib/icons'

type Site = { id: string; label: string | null; address: string; lat: number | null; lng: number | null }

interface Props {
  visible: boolean
  jobId: string
  customerId: string | null
  currentSiteId: string | null
  onClose: () => void
  onSaved: () => void
}

// Mirrors tradiee-app/components/jobs/job-site-selector.tsx and the site
// picker in app/jobs/new.tsx — RLS already lets an assigned technician write
// jobs.site_id (same "members write jobs" policy that lets them update
// status), this just adds the missing mobile UI for it.
export function ChangeSiteModal({ visible, jobId, customerId, currentSiteId, onClose, onSaved }: Props) {
  const [sites, setSites] = useState<Site[]>([])
  const [selected, setSelected] = useState<string | null>(currentSiteId)
  const [newAddress, setNewAddress] = useState('')
  const [newCoords, setNewCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible || !customerId) return
    setSelected(currentSiteId)
    setNewAddress('')
    setNewCoords({ lat: null, lng: null })
    supabase.from('customer_sites')
      .select('id, label, address, lat, lng')
      .eq('customer_id', customerId)
      .order('created_at')
      .then(({ data }) => setSites((data ?? []) as Site[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customerId])

  async function save() {
    let siteId = selected

    if (!siteId && newAddress.trim()) {
      if (!customerId) { Alert.alert('Error', 'No customer on this job'); return }
      setSaving(true)
      const coords = newCoords.lat != null ? newCoords : (await geocodeAddress(newAddress)) ?? { lat: null, lng: null }
      const { data, error } = await supabase.from('customer_sites')
        .insert({ customer_id: customerId, address: newAddress.trim(), lat: coords.lat, lng: coords.lng })
        .select('id').single()
      if (error) { setSaving(false); Alert.alert('Error', error.message); return }
      siteId = data.id
    }

    if (!siteId) { Alert.alert('Select or enter a site address'); return }

    setSaving(true)
    const { error } = await supabase.from('jobs').update({ site_id: siteId }).eq('id', jobId)
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    onSaved()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>Job site</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {sites.map(site => (
              <TouchableOpacity
                key={site.id}
                style={[styles.siteRow, selected === site.id && styles.siteRowActive]}
                onPress={() => { setSelected(selected === site.id ? null : site.id); setNewAddress('') }}
                activeOpacity={0.7}
                accessibilityLabel={`Job site: ${site.label ?? site.address}`}
              >
                <Icon name={selected === site.id ? 'check-circle' : 'circle'} size={18} color={selected === site.id ? '#f97316' : '#9ca3af'} />
                <View style={{ flex: 1 }}>
                  {site.label ? <Text style={styles.siteLabel}>{site.label}</Text> : null}
                  <Text style={styles.siteAddr} numberOfLines={2}>{site.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {!selected && (
              <AddressAutocomplete
                style={[styles.input, sites.length > 0 && { marginTop: 8 }]}
                value={newAddress}
                onChangeText={v => { setNewAddress(v); setNewCoords({ lat: null, lng: null }) }}
                onSelect={sel => { setNewAddress(sel.address); setNewCoords({ lat: sel.lat, lng: sel.lng }) }}
                placeholder={sites.length > 0 ? 'Or add a new site address…' : 'Site address…'}
              />
            )}
            <TouchableOpacity
              style={[styles.saveBtn, (saving || (!selected && !newAddress.trim())) && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving || (!selected && !newAddress.trim())}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  cancel: { fontSize: 16, color: '#6b7280' },
  siteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  siteRowActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  siteLabel: { fontSize: 12, color: '#9ca3af' },
  siteAddr: { fontSize: 14, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb' },
  saveBtn: { backgroundColor: '#f97316', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
