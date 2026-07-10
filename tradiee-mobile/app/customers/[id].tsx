import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Platform, Modal, TextInput, Alert, KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geocode'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'

function openPhone(phone: string) {
  Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)
}

function openMaps(address: string) {
  const encoded = encodeURIComponent(address)
  const url = Platform.OS === 'ios'
    ? `maps://maps.apple.com/?q=${encoded}`
    : `https://maps.google.com/?q=${encoded}`
  Linking.openURL(url)
}

const JOB_STATUS_COLOR: Record<string, string> = {
  unscheduled: '#6b7280',
  scheduled:   '#3b82f6',
  in_progress: '#f97316',
  on_hold:     '#eab308',
  completed:   '#22c55e',
  cancelled:   '#ef4444',
}

const JOB_STATUS_LABEL: Record<string, string> = {
  unscheduled: 'Unscheduled',
  scheduled:   'Scheduled',
  in_progress: 'In progress',
  on_hold:     'On hold',
  completed:   'Completed',
  cancelled:   'Cancelled',
}

type Customer = {
  id: string
  name: string
  type: string
  email: string | null
  phone: string | null
  billing_address: string | null
  contact_person: string | null
}

type Site = {
  id: string
  label: string | null
  address: string
  access_notes: string | null
}

type Job = {
  id: string
  job_number: string
  title: string
  status: string
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState({ name: '', type: '', email: '', phone: '', billing_address: '', contact_person: '', notes: '', pricing_group_id: '' })
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Kept as separate first/last inputs but joined into the single `name`
  // column everything else in the app (invoices, portal, PDFs) reads.
  function updateName(first: string, last: string) {
    setFirstName(first)
    setLastName(last)
    setForm(f => ({ ...f, name: `${first} ${last}`.trim() }))
  }
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  // Site add/edit modal
  const [showSite, setShowSite] = useState(false)
  const [editingSite, setEditingSite] = useState<Site | null>(null)
  const [siteForm, setSiteForm] = useState({ label: '', address: '', access_notes: '' })
  const [siteCoords, setSiteCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [savingSite, setSavingSite] = useState(false)

  const { data: customers, isLoading, refresh: refreshCustomer } = useQuery<Customer>(
    `SELECT id, name, type, email, phone, billing_address, contact_person
     FROM customers WHERE id = ?`,
    [id]
  )
  const customer = customers?.[0]

  async function openEdit() {
    if (!customer) return
    setForm({
      name: customer.name ?? '',
      type: customer.type ?? 'residential',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      billing_address: customer.billing_address ?? '',
      contact_person: customer.contact_person ?? '',
      notes: '',
      pricing_group_id: '',
    })
    setFirstName(customer.name?.split(' ')[0] ?? '')
    setLastName(customer.name?.split(' ').slice(1).join(' ') ?? '')
    setShowEdit(true)
    // notes / pricing_group_id aren't in the PowerSync schema — fetch from supabase
    const { data } = await supabase.from('customers').select('notes, pricing_group_id, company_id').eq('id', id).single()
    if (!data) return
    setForm(f => ({ ...f, notes: data.notes ?? '', pricing_group_id: data.pricing_group_id ?? '' }))
    const { data: g } = await supabase.from('customer_groups').select('id, name').eq('company_id', data.company_id).order('name')
    setGroups(g ?? [])
  }

  async function saveEdit() {
    if (!form.name.trim()) { Alert.alert('Name required', 'Please enter a customer name.'); return }
    setSaving(true)
    const { error } = await supabase.from('customers').update({
      name: form.name.trim(),
      type: form.type,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      billing_address: form.billing_address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      notes: form.notes.trim() || null,
      pricing_group_id: form.pricing_group_id || null,
    }).eq('id', id)
    setSaving(false)
    if (error) { Alert.alert('Error', error.message); return }
    setShowEdit(false)
    refreshCustomer?.()
  }

  function openAddSite() {
    setEditingSite(null)
    setSiteForm({ label: '', address: '', access_notes: '' })
    setSiteCoords({ lat: null, lng: null })
    setShowSite(true)
  }

  function openEditSite(site: Site) {
    setEditingSite(site)
    setSiteForm({ label: site.label ?? '', address: site.address, access_notes: site.access_notes ?? '' })
    setSiteCoords({ lat: null, lng: null })
    setShowSite(true)
  }

  async function saveSite() {
    const addr = siteForm.address.trim()
    if (!addr) { Alert.alert('Address required', 'Please enter a site address.'); return }
    setSavingSite(true)
    // Re-geocode only when the address is new or changed; keep coords from a picked suggestion
    const addressChanged = !editingSite || addr !== editingSite.address
    const coords = siteCoords.lat != null
      ? siteCoords
      : addressChanged ? (await geocodeAddress(addr)) ?? { lat: null, lng: null } : null
    const row = {
      label: siteForm.label.trim() || null,
      address: addr,
      access_notes: siteForm.access_notes.trim() || null,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    }
    const { error } = editingSite
      ? await supabase.from('customer_sites').update(row).eq('id', editingSite.id)
      : await supabase.from('customer_sites').insert({ ...row, customer_id: id })
    setSavingSite(false)
    if (error) { Alert.alert('Error', error.message); return }
    setShowSite(false)
    refreshSites?.()
  }

  function deleteSite(site: Site) {
    Alert.alert('Delete site?', site.label ? `${site.label}\n${site.address}` : site.address, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('customer_sites').delete().eq('id', site.id)
          if (error) { Alert.alert('Error', error.message); return }
          refreshSites?.()
        },
      },
    ])
  }

  const { data: sites, refresh: refreshSites } = useQuery<Site>(
    `SELECT id, label, address, access_notes
     FROM customer_sites WHERE customer_id = ?
     ORDER BY rowid ASC`,
    [id]
  )

  const { data: jobs } = useQuery<Job>(
    `SELECT id, job_number, title, status
     FROM jobs WHERE customer_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
    [id]
  )

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  if (!customer) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280' }}>Customer not found</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <Stack.Screen options={{
        title: customer.name, headerTintColor: '#f97316',
        headerRight: () => (
          <TouchableOpacity onPress={openEdit} hitSlop={10}>
            <Feather name="edit-2" size={20} color="#f97316" />
          </TouchableOpacity>
        ),
      }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Info card */}
        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {customer.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customer.name}</Text>
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{customer.type}</Text>
              </View>
            </View>
          </View>

          {customer.contact_person && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Contact</Text>
              <Text style={styles.metaValue}>{customer.contact_person}</Text>
            </View>
          )}
          {customer.email && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Email</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{customer.email}</Text>
            </View>
          )}
          {customer.phone && (
            <TouchableOpacity style={styles.metaRow} onPress={() => openPhone(customer.phone!)} activeOpacity={0.7}>
              <Text style={styles.metaLabel}>Phone</Text>
              <Text style={[styles.metaValue, { color: '#f97316' }]}>{customer.phone}</Text>
            </TouchableOpacity>
          )}
          {customer.billing_address && (
            <TouchableOpacity style={styles.metaRow} onPress={() => openMaps(customer.billing_address!)} activeOpacity={0.7}>
              <Text style={styles.metaLabel}>Address</Text>
              <Text style={[styles.metaValue, { flex: 1, color: '#f97316' }]} numberOfLines={3}>{customer.billing_address}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sites */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Sites</Text>
            <TouchableOpacity style={styles.addSiteBtn} onPress={openAddSite} hitSlop={8} accessibilityLabel="Add site">
              <Feather name="plus-circle" size={17} color="#f97316" />
              <Text style={styles.addSiteText}>Add site</Text>
            </TouchableOpacity>
          </View>
          {(sites ?? []).map((site, idx) => (
            <View key={site.id} style={[styles.siteRow, idx === 0 && { borderTopWidth: 0 }]}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => openMaps(site.address)} activeOpacity={0.7}>
                {site.label && (
                  <Text style={styles.siteLabel}>{site.label}</Text>
                )}
                <Text style={[styles.siteAddress, { color: '#f97316' }]}>{site.address}</Text>
                {site.access_notes && (
                  <Text style={styles.siteNotes} numberOfLines={2}>{site.access_notes}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.siteIconBtn} onPress={() => openEditSite(site)} accessibilityLabel={`Edit site ${site.label ?? site.address}`}>
                <Feather name="edit-2" size={17} color="#9ca3af" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.siteIconBtn} onPress={() => deleteSite(site)} accessibilityLabel={`Delete site ${site.label ?? site.address}`}>
                <Feather name="trash-2" size={17} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
          {(sites ?? []).length === 0 && (
            <Text style={styles.siteNotes}>No sites yet</Text>
          )}
        </View>

        {/* Recent jobs */}
        {(jobs ?? []).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent Jobs</Text>
            {(jobs ?? []).map((job, idx) => {
              const color = JOB_STATUS_COLOR[job.status] ?? '#9ca3af'
              return (
                <TouchableOpacity
                  key={job.id}
                  style={[styles.jobRow, idx === 0 && { borderTopWidth: 0 }]}
                  onPress={() => router.push(`/jobs/${job.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobNumber}>{job.job_number}</Text>
                    <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.statusText, { color }]}>
                      {JOB_STATUS_LABEL[job.status] ?? job.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Customer</Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={firstName} onChangeText={v => updateName(v, lastName)} placeholder="First name *" placeholderTextColor="#6b7280" />
              <TextInput style={[styles.input, { flex: 1 }]} value={lastName} onChangeText={v => updateName(firstName, v)} placeholder="Last name" placeholderTextColor="#6b7280" />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['residential', 'commercial'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeToggle, form.type === t && styles.typeToggleActive]}
                  onPress={() => setForm(f => ({ ...f, type: t }))}
                >
                  <Text style={[styles.typeToggleText, form.type === t && styles.typeToggleTextActive]}>
                    {t === 'residential' ? 'Residential' : 'Commercial'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={form.contact_person} onChangeText={v => setForm(f => ({ ...f, contact_person: v }))} placeholder="Contact person" placeholderTextColor="#6b7280" />
            <TextInput style={styles.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="Email" placeholderTextColor="#6b7280" keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} placeholder="Phone" placeholderTextColor="#6b7280" keyboardType="phone-pad" />
            <AddressAutocomplete style={styles.input} value={form.billing_address} onChangeText={v => setForm(f => ({ ...f, billing_address: v }))} placeholder="Billing address" />
            {groups.length > 0 && (
              <View>
                <Text style={styles.fieldLabel}>Pricing level</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[{ id: '', name: 'Standard pricing' }, ...groups].map(g => (
                    <TouchableOpacity
                      key={g.id || 'standard'}
                      style={[styles.typeToggle, { flex: 0, paddingHorizontal: 14, paddingVertical: 12 }, form.pricing_group_id === g.id && styles.typeToggleActive]}
                      onPress={() => setForm(f => ({ ...f, pricing_group_id: g.id }))}
                    >
                      <Text style={[styles.typeToggleText, form.pricing_group_id === g.id && styles.typeToggleTextActive]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <TextInput style={[styles.input, styles.multiline]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Notes" placeholderTextColor="#6b7280" multiline numberOfLines={4} textAlignVertical="top" />
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={saveEdit} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showSite} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSite(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingSite ? 'Edit Site' : 'Add Site'}</Text>
            <TouchableOpacity onPress={() => setShowSite(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              value={siteForm.label}
              onChangeText={v => setSiteForm(f => ({ ...f, label: v }))}
              placeholder="Label (e.g. Warehouse, Rental unit)"
              placeholderTextColor="#6b7280"
              autoFocus
            />
            <AddressAutocomplete
              style={styles.input}
              value={siteForm.address}
              onChangeText={v => { setSiteForm(f => ({ ...f, address: v })); setSiteCoords({ lat: null, lng: null }) }}
              onSelect={sel => { setSiteForm(f => ({ ...f, address: sel.address })); setSiteCoords({ lat: sel.lat, lng: sel.lng }) }}
              placeholder="Site address *"
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={siteForm.access_notes}
              onChangeText={v => setSiteForm(f => ({ ...f, access_notes: v }))}
              placeholder="Access notes (gate codes, dogs, parking…)"
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity style={[styles.saveBtn, (savingSite || !siteForm.address.trim()) && { opacity: 0.5 }]} onPress={saveSite} disabled={savingSite || !siteForm.address.trim()} activeOpacity={0.85}>
              {savingSite ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingSite ? 'Save site' : 'Add site'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 15, color: '#f97316', fontWeight: '600' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  typeToggle: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  typeToggleActive: { backgroundColor: '#fff7ed', borderColor: '#f97316' },
  typeToggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  typeToggleTextActive: { color: '#f97316' },
  saveBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#f97316' },
  customerName: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  typeBadge: { alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 11, fontWeight: '600', color: '#3b82f6', textTransform: 'capitalize' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  metaLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', textAlign: 'right' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  siteIconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addSiteBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 4 },
  addSiteText: { fontSize: 13, fontWeight: '600', color: '#f97316' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  multiline: { minHeight: 100, paddingTop: 12 },
  siteLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 2 },
  siteAddress: { fontSize: 14, color: '#111827' },
  siteNotes: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  jobRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 10 },
  jobNumber: { fontSize: 11, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5, marginBottom: 1 },
  jobTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  statusBadge: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '600' },
})
