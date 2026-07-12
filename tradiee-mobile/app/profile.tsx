import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Modal, SafeAreaView, FlatList,
} from 'react-native'
import { Stack, router } from 'expo-router'
import { Icon, type IconName } from '@/lib/icons'
import { supabase } from '@/lib/supabase'
import { TIMEZONES, DEFAULT_TIMEZONE } from '@/lib/datetime'
import { useProfileRefresh } from '@/lib/profile-context'

export default function ProfileScreen() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleReg, setVehicleReg] = useState('')
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [showTzPicker, setShowTzPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const refreshProfile = useProfileRefresh()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles')
        .select('full_name, phone, vehicle_registration, timezone')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setFullName(data?.full_name ?? '')
          setPhone(data?.phone ?? '')
          setVehicleReg(data?.vehicle_registration ?? '')
          setTimezone(data?.timezone ?? DEFAULT_TIMEZONE)
          setLoading(false)
        })
    })
  }, [])

  async function save() {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      vehicle_registration: vehicleReg.trim() || null,
      timezone,
    }).eq('id', userId)
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    await refreshProfile()
    Alert.alert('Saved', 'Profile updated.', [{ text: 'OK', onPress: () => router.back() }])
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'My Profile', headerTintColor: '#f97316' }} />
      <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <View style={s.field}>
          <Text style={s.label}>Full name</Text>
          <TextInput
            style={s.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#6b7280"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Phone</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+64 21 …"
            placeholderTextColor="#6b7280"
            keyboardType="phone-pad"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Timezone</Text>
          <TouchableOpacity style={s.picker} onPress={() => setShowTzPicker(true)} activeOpacity={0.7}>
            <Text style={s.pickerVal}>{TIMEZONES.find(tz => tz.value === timezone)?.label ?? timezone}</Text>
            <Icon name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <Text style={s.hint}>Used for dates & times across web and mobile, on this account</Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Vehicle registration</Text>
          <TextInput
            style={s.input}
            value={vehicleReg}
            onChangeText={setVehicleReg}
            placeholder="ABC123"
            placeholderTextColor="#6b7280"
            autoCapitalize="characters"
          />
          <Text style={s.hint}>Used in the GPS vehicle logbook</Text>
        </View>

        <TouchableOpacity
          style={[s.btn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Save changes</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showTzPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTzPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Timezone</Text>
            <TouchableOpacity onPress={() => setShowTzPicker(false)}>
              <Icon name="x" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={TIMEZONES}
            keyExtractor={item => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.tzRow}
                onPress={() => { setTimezone(item.value); setShowTzPicker(false) }}
                activeOpacity={0.7}
              >
                <Text style={s.tzRowText}>{item.label}</Text>
                {item.value === timezone && <Icon name="check" size={18} color="#f97316" />}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  btn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  picker: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerVal: { fontSize: 15, color: '#111827' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  tzRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tzRowText: { fontSize: 15, color: '#111827' },
})
