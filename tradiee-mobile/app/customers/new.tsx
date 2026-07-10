import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Switch,
} from 'react-native'
import { router, Stack } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'

export default function NewCustomerScreen() {
  const [form, setForm] = useState({
    type: 'residential' as 'residential' | 'commercial',
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    billing_address: '',
    notes: '',
  })
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [addAsSite, setAddAsSite] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('company_id').eq('id', user.id).single()
        .then(({ data: prof }) => { if (prof) setCompanyId(prof.company_id) })
    })
  }, [])

  const valid = !!(form.name.trim() && form.email.trim() && form.phone.trim() && form.billing_address.trim())

  async function save() {
    if (!valid) { Alert.alert('Missing details', 'Name, email, phone, and billing address are all required.'); return }
    if (!companyId) return
    setSaving(true)
    const { data, error } = await supabase.from('customers').insert({
      type: form.type,
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim(),
      phone: form.phone.trim(),
      billing_address: form.billing_address.trim(),
      notes: form.notes.trim() || null,
      company_id: companyId,
      is_active: true,
    }).select('id').single()
    if (error) { setSaving(false); Alert.alert('Error', error.message); return }

    if (addAsSite) {
      // Typed without picking a suggestion → geocode the text so the site still gets coords
      const c = coords.lat != null ? coords : (await geocodeAddress(form.billing_address)) ?? { lat: null, lng: null }
      await supabase.from('customer_sites').insert({
        customer_id: data.id,
        address: form.billing_address.trim(),
        label: 'Billing address',
        lat: c.lat,
        lng: c.lng,
      })
    }
    setSaving(false)
    router.replace(`/customers/${data.id}`)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'New Customer', headerTintColor: '#f97316' }} />
      <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <View style={s.field}>
          <Text style={s.label}>Type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['residential', 'commercial'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[s.typeToggle, form.type === t && s.typeToggleActive]}
                onPress={() => setForm(f => ({ ...f, type: t }))}
                activeOpacity={0.7}
              >
                <Text style={[s.typeToggleText, form.type === t && s.typeToggleTextActive]}>
                  {t === 'residential' ? 'Residential' : 'Commercial'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Name *</Text>
          <TextInput
            style={s.input}
            value={form.name}
            onChangeText={v => setForm(f => ({ ...f, name: v }))}
            placeholder="Customer or company name"
            placeholderTextColor="#6b7280"
            autoFocus
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Contact person</Text>
          <TextInput
            style={s.input}
            value={form.contact_person}
            onChangeText={v => setForm(f => ({ ...f, contact_person: v }))}
            placeholder="If commercial"
            placeholderTextColor="#6b7280"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Email *</Text>
          <TextInput
            style={s.input}
            value={form.email}
            onChangeText={v => setForm(f => ({ ...f, email: v }))}
            placeholder="email@example.com"
            placeholderTextColor="#6b7280"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Phone *</Text>
          <TextInput
            style={s.input}
            value={form.phone}
            onChangeText={v => setForm(f => ({ ...f, phone: v }))}
            placeholder="Phone number"
            placeholderTextColor="#6b7280"
            keyboardType="phone-pad"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Billing address *</Text>
          <AddressAutocomplete
            style={s.input}
            value={form.billing_address}
            onChangeText={v => { setForm(f => ({ ...f, billing_address: v })); setCoords({ lat: null, lng: null }) }}
            onSelect={sel => { setForm(f => ({ ...f, billing_address: sel.address })); setCoords({ lat: sel.lat, lng: sel.lng }) }}
            placeholder="Start typing an address…"
          />
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Also add as job site</Text>
            <Switch
              value={addAsSite}
              onValueChange={setAddAsSite}
              trackColor={{ true: '#f97316' }}
              accessibilityLabel="Also add billing address as job site"
            />
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Notes</Text>
          <TextInput
            style={[s.input, s.multiline]}
            value={form.notes}
            onChangeText={v => setForm(f => ({ ...f, notes: v }))}
            placeholder="Optional notes about this customer…"
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[s.btn, (!valid || saving) && { opacity: 0.5 }]}
          onPress={save}
          disabled={!valid || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Create Customer</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  multiline: { minHeight: 100, paddingTop: 12 },
  typeToggle: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center' },
  typeToggleActive: { backgroundColor: '#fff7ed', borderColor: '#f97316' },
  typeToggleText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  typeToggleTextActive: { color: '#f97316' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, minHeight: 44 },
  switchLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  btn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
