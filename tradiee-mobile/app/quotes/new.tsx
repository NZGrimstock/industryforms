import { useState, useEffect, useRef, type RefObject } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Modal, FlatList,
} from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { PriceListDescriptionInput, type PriceListLookupItem } from '@/components/PriceListDescriptionInput'
import { geocodeAddress } from '@/lib/geocode'
import { scrollFieldAboveKeyboard } from '@/lib/keyboard'

type Customer = { id: string; name: string; phone: string | null; email: string | null }
type LineItem = { id: string; description: string; quantity: string; unit: string; unit_price: string; price_list_item_id: string | null; sectionId: string | null }
type QuoteSection = { id: string; title: string }
type Site = { id: string; label: string | null; address: string }

const EXPIRY_OPTIONS = [7, 14, 30, 60]

let _id = 0
function uid() { return String(++_id) }

export default function NewQuoteScreen() {
  // Carried over when arriving from Inbox → enquiry → "Convert to quote"
  // (Mobile Overhaul brief finding #4 — convert used to drop the enquiry data).
  const params = useLocalSearchParams<{ name?: string; email?: string; phone?: string; address?: string; notes?: string }>()
  const scrollRef = useRef<ScrollView>(null)
  const titleRef = useRef<TextInput>(null)
  const messageRef = useRef<TextInput>(null)
  const sectionTitleRef = useRef<TextInput>(null)
  const itemQtyRef = useRef<TextInput>(null)
  const itemUnitRef = useRef<TextInput>(null)
  const itemPriceRef = useRef<TextInput>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState<string | null>(null)
  const [showSitePicker, setShowSitePicker] = useState(false)
  const [expiryDays, setExpiryDays] = useState(30)
  const [quoteNumber, setQuoteNumber] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [sections, setSections] = useState<QuoteSection[]>([])
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState({ description: '', quantity: '1', unit: 'ea', unit_price: '', price_list_item_id: null as string | null })
  const [priceItems, setPriceItems] = useState<PriceListLookupItem[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [gstRate, setGstRate] = useState(0.15)
  const [saving, setSaving] = useState(false)
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', email: '', phone: '', billing_address: '' })
  const [newCustFirstName, setNewCustFirstName] = useState('')
  const [newCustLastName, setNewCustLastName] = useState('')
  const [creatingCust, setCreatingCust] = useState(false)
  const newCustValid = !!(newCust.name.trim() && newCust.email.trim() && newCust.phone.trim() && newCust.billing_address.trim())

  const focusField = (ref: RefObject<TextInput | null>) => {
    setTimeout(() => scrollFieldAboveKeyboard(scrollRef, ref, 12), 50)
  }

  // Kept as separate first/last inputs but joined into the single `name`
  // column everything else in the app (invoices, portal, PDFs) reads.
  function updateNewCustName(first: string, last: string) {
    setNewCustFirstName(first)
    setNewCustLastName(last)
    setNewCust(p => ({ ...p, name: `${first} ${last}`.trim() }))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('company_id').eq('id', user.id).single()
        .then(({ data: prof }) => {
          if (!prof) return
          setCompanyId(prof.company_id)
          Promise.all([
            supabase.from('companies').select('default_gst_rate, quote_prefix').eq('id', prof.company_id).single(),
            supabase.from('customers').select('id, name, phone, email').eq('company_id', prof.company_id).eq('is_active', true).order('name').limit(300),
            supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', prof.company_id),
            supabase.from('price_list_items').select('id, name, unit, sell_price, cost_price, category').eq('company_id', prof.company_id).eq('is_active', true).order('name').limit(500),
          ]).then(([coRes, custRes, countRes, priceRes]) => {
            if (coRes.data) setGstRate(Number(coRes.data.default_gst_rate) || 0.15)
            setCustomers(custRes.data ?? [])
            setPriceItems(priceRes.data ?? [])
            const prefix = coRes.data?.quote_prefix ?? 'Q-'
            setQuoteNumber(`${prefix}${String((countRes.count ?? 0) + 1).padStart(4, '0')}`)
          })
        })
    })
  }, [])

  useEffect(() => {
    if (!params.name) return
    setTitle(prev => prev || (params.notes ? params.notes.slice(0, 80) : `Quote for ${params.name}`))
    setNewCust({
      name: params.name ?? '',
      email: params.email ?? '',
      phone: params.phone ?? '',
      billing_address: params.address ?? '',
    })
    setNewCustFirstName(params.name?.split(' ')[0] ?? '')
    setNewCustLastName(params.name?.split(' ').slice(1).join(' ') ?? '')
    setShowPicker(true)
    setShowNewCustomer(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.name])

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (!customerId) { setSites([]); setSiteId(null); return }
    setSiteId(null)
    supabase.from('customer_sites').select('id, label, address').eq('customer_id', customerId).order('created_at')
      .then(({ data }) => setSites(data ?? []))
  }, [customerId])

  function selectCustomer(c: Customer) {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setCustomerEmail(c.email)
    setShowPicker(false)
    setSearch('')
  }

  function addItem() {
    if (!newItem.description.trim() || !newItem.unit_price) return
    // New items land in the most recent section (or unsectioned if none yet)
    setLineItems(prev => [...prev, { id: uid(), ...newItem, sectionId: sections.length ? sections[sections.length - 1].id : null }])
    setNewItem({ description: '', quantity: '1', unit: 'ea', unit_price: '', price_list_item_id: null })
    setShowAddItem(false)
  }

  function addSection() {
    if (!newSectionTitle.trim()) return
    setSections(prev => [...prev, { id: uid(), title: newSectionTitle.trim() }])
    setNewSectionTitle('')
    setShowAddSection(false)
  }

  function removeSection(sectionId: string) {
    setSections(prev => prev.filter(sec => sec.id !== sectionId))
    // Items in the removed section become unsectioned rather than deleted
    setLineItems(prev => prev.map(i => i.sectionId === sectionId ? { ...i, sectionId: null } : i))
  }

  const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0)
  const gst = subtotal * gstRate
  const total = subtotal + gst

  async function createCustomer() {
    if (!newCustValid || !companyId) { Alert.alert('Missing details', 'Name, email, phone, and billing address are all required.'); return }
    setCreatingCust(true)
    const { data, error } = await supabase.from('customers').insert({
      name: newCust.name.trim(),
      email: newCust.email.trim(),
      phone: newCust.phone.trim(),
      billing_address: newCust.billing_address.trim(),
      company_id: companyId,
    }).select('id, name, phone, email').single()
    if (error) { setCreatingCust(false); Alert.alert('Error', error.message); return }
    if (data) {
      const coords = (await geocodeAddress(newCust.billing_address)) ?? { lat: null, lng: null }
      await supabase.from('customer_sites').insert({
        customer_id: data.id,
        address: newCust.billing_address.trim(),
        label: 'Billing address',
        lat: coords.lat,
        lng: coords.lng,
      })
      setCustomers(prev => [data, ...prev].sort((a, b) => a.name.localeCompare(b.name)))
      selectCustomer(data)
      setNewCust({ name: '', email: '', phone: '', billing_address: '' })
      setNewCustFirstName('')
      setNewCustLastName('')
      setShowNewCustomer(false)
    }
    setCreatingCust(false)
  }

  async function save(andSend: boolean) {
    if (!title.trim()) { Alert.alert('Title required'); return }
    if (!companyId || !userId) return
    if (andSend && !customerEmail) {
      Alert.alert('No email', 'This customer has no email address. Save as draft instead.')
      return
    }
    setSaving(true)
    try {
      const { data: quote, error } = await supabase.from('quotes').insert({
        title: title.trim(),
        customer_message: message.trim() || null,
        company_id: companyId,
        customer_id: customerId,
        site_id: siteId,
        created_by: userId,
        status: 'draft',
        quote_number: quoteNumber,
        subtotal,
        gst_amount: gst,
        total,
        expires_at: new Date(Date.now() + expiryDays * 86400000).toISOString(),
      }).select('id').single()
      if (error || !quote) throw new Error(error?.message ?? 'Failed to create quote')

      // Insert sections first, keeping a local-id → db-id map (same model as web quote-builder)
      const sectionIdMap = new Map<string, string>()
      for (let si = 0; si < sections.length; si++) {
        const { data: sec } = await supabase.from('quote_sections').insert({
          quote_id: quote.id,
          company_id: companyId,
          title: sections[si].title,
          is_optional: false,
          sort_order: si,
        }).select('id').single()
        if (sec) sectionIdMap.set(sections[si].id, sec.id)
      }

      if (lineItems.length > 0) {
        await supabase.from('quote_line_items').insert(
          lineItems.map((item, idx) => ({
            quote_id: quote.id,
            company_id: companyId,
            section_id: item.sectionId ? sectionIdMap.get(item.sectionId) ?? null : null,
            price_list_item_id: item.price_list_item_id,
            description: item.description.trim(),
            quantity: parseFloat(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0,
            line_total: (parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0),
            unit: item.unit || 'ea',
            sort_order: idx,
          }))
        )
      }

      if (andSend) {
        const { data: { session } } = await supabase.auth.getSession()
        const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
        const res = await fetch(`${apiBase}/api/email/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ quoteId: quote.id }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error ?? 'Failed to send email')
        }
      }

      router.replace(`/quotes/${quote.id}`)
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: 'New Quote', headerTintColor: '#f97316' }} />
      <ScrollView
        ref={scrollRef}
        style={s.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 260 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.field}>
          <Text style={s.label}>Title *</Text>
          <TextInput ref={titleRef} style={s.input} value={title} onChangeText={setTitle} placeholder="e.g. Kitchen renovation quote" placeholderTextColor="#6b7280" autoFocus onFocus={() => focusField(titleRef)} />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Customer</Text>
          <TouchableOpacity style={s.picker} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
            <Text style={customerId ? s.pickerVal : s.pickerPh}>{customerName || 'Select a customer…'}</Text>
            <Feather name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {customerId && sites.length > 0 && (
          <View style={s.field}>
            <Text style={s.label}>Job site</Text>
            <TouchableOpacity style={s.picker} onPress={() => setShowSitePicker(true)} activeOpacity={0.7}>
              <Text style={siteId ? s.pickerVal : s.pickerPh}>
                {siteId ? (sites.find(s2 => s2.id === siteId)?.label || sites.find(s2 => s2.id === siteId)?.address) : 'No site selected…'}
              </Text>
              <Feather name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        )}

        <View style={s.field}>
          <Text style={s.label}>Expires in</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {EXPIRY_OPTIONS.map(days => (
              <TouchableOpacity
                key={days}
                style={[s.expiryChip, expiryDays === days && s.expiryChipActive]}
                onPress={() => setExpiryDays(days)}
              >
                <Text style={[s.expiryChipText, expiryDays === days && s.expiryChipTextActive]}>{days} days</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Message to customer</Text>
          <TextInput ref={messageRef} style={[s.input, { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} placeholder="Included in the quote email…" placeholderTextColor="#6b7280" multiline onFocus={() => focusField(messageRef)} />
        </View>

        {/* Line items */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Materials</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={() => setShowAddSection(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                <Text style={s.addLink}>+ Section</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAddItem(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                <Text style={s.addLink}>+ Add item</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showAddSection && (
            <View style={s.addItemBox}>
              <TextInput ref={sectionTitleRef} style={[s.input, { marginBottom: 8 }]} value={newSectionTitle} onChangeText={setNewSectionTitle} placeholder="Section title, e.g. Materials" placeholderTextColor="#6b7280" autoFocus onFocus={() => focusField(sectionTitleRef)} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, paddingVertical: 11 }]} onPress={addSection}>
                  <Text style={s.btnText}>Add section</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ghostBtn, { flex: 1 }]} onPress={() => setShowAddSection(false)}>
                  <Text style={s.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {showAddItem && (
            <View style={s.addItemBox}>
              <PriceListDescriptionInput
                value={newItem.description}
                items={priceItems}
                onChangeText={v => setNewItem(p => ({ ...p, description: v, price_list_item_id: null }))}
                onPick={item => setNewItem(p => ({
                  ...p,
                  description: item.name,
                  unit: item.unit || 'ea',
                  unit_price: String(Number(item.sell_price) || 0),
                  price_list_item_id: item.id,
                }))}
                inputStyle={[s.input, { marginBottom: 0 }]}
                containerStyle={{ marginBottom: 8 }}
                scrollViewRef={scrollRef}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput ref={itemQtyRef} style={[s.input, { flex: 1 }]} value={newItem.quantity} onChangeText={v => setNewItem(p => ({ ...p, quantity: v }))} placeholder="Qty" keyboardType="decimal-pad" placeholderTextColor="#6b7280" onFocus={() => focusField(itemQtyRef)} />
                <TextInput ref={itemUnitRef} style={[s.input, { flex: 1 }]} value={newItem.unit} onChangeText={v => setNewItem(p => ({ ...p, unit: v }))} placeholder="Unit" placeholderTextColor="#6b7280" onFocus={() => focusField(itemUnitRef)} />
                <TextInput ref={itemPriceRef} style={[s.input, { flex: 2 }]} value={newItem.unit_price} onChangeText={v => setNewItem(p => ({ ...p, unit_price: v }))} placeholder="Unit price ($)" keyboardType="decimal-pad" placeholderTextColor="#6b7280" onFocus={() => focusField(itemPriceRef)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.btn, { flex: 1, paddingVertical: 11 }]} onPress={addItem}>
                  <Text style={s.btnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ghostBtn, { flex: 1 }]} onPress={() => setShowAddItem(false)}>
                  <Text style={s.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {lineItems.length === 0 && sections.length === 0 && !showAddItem ? (
            <Text style={s.empty}>No materials — tap "+ Add item" above</Text>
          ) : (
            <>
              {lineItems.filter(i => !i.sectionId).map(item => (
                <LineItemRow key={item.id} item={item} onRemove={() => setLineItems(p => p.filter(i => i.id !== item.id))} />
              ))}
              {sections.map(sec => (
                <View key={sec.id}>
                  <View style={s.qSectionRow}>
                    <Text style={s.qSectionTitle}>{sec.title}</Text>
                    <TouchableOpacity onPress={() => removeSection(sec.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={`Remove section ${sec.title}`} accessibilityRole="button">
                      <Feather name="x" size={14} color="#d1d5db" />
                    </TouchableOpacity>
                  </View>
                  {lineItems.filter(i => i.sectionId === sec.id).map(item => (
                    <LineItemRow key={item.id} item={item} onRemove={() => setLineItems(p => p.filter(i => i.id !== item.id))} />
                  ))}
                  {lineItems.filter(i => i.sectionId === sec.id).length === 0 && (
                    <Text style={s.empty}>Items added next will go in this section</Text>
                  )}
                </View>
              ))}
            </>
          )}

          {lineItems.length > 0 && (
            <View style={s.totals}>
              <View style={s.totalRow}><Text style={s.totalLbl}>Subtotal</Text><Text style={s.totalVal}>${subtotal.toFixed(2)}</Text></View>
              <View style={s.totalRow}><Text style={s.totalLbl}>GST ({(gstRate * 100).toFixed(0)}%)</Text><Text style={s.totalVal}>${gst.toFixed(2)}</Text></View>
              <View style={[s.totalRow, s.totalRowFinal]}><Text style={s.totalLblBold}>Total</Text><Text style={s.totalValBold}>${total.toFixed(2)}</Text></View>
            </View>
          )}
        </View>

        {/* Save / Send buttons */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[s.btn, { flex: 1, opacity: saving ? 0.5 : 1 }]} onPress={() => save(false)} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Save draft</Text>}
          </TouchableOpacity>
          {customerId && (
            <TouchableOpacity style={[s.sendBtn, { flex: 1, opacity: saving ? 0.5 : 1 }]} onPress={() => save(true)} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="send" size={15} color="#fff" />
                  <Text style={s.btnText}>Send</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Customer picker */}
      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowPicker(false); setSearch(''); setShowNewCustomer(false) }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Customer</Text>
            <TouchableOpacity onPress={() => { setShowPicker(false); setSearch(''); setShowNewCustomer(false) }}>
              <Text style={s.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {!showNewCustomer ? (
            <>
              <View style={s.searchBox}>
                <Feather name="search" size={15} color="#9ca3af" />
                <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search customers…" placeholderTextColor="#6b7280" autoFocus />
              </View>
              <FlatList
                data={filteredCustomers}
                keyExtractor={c => c.id}
                contentContainerStyle={{ padding: 12 }}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <TouchableOpacity
                    style={[s.custRow, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff7ed', borderRadius: 12, marginBottom: 8 }]}
                    onPress={() => setShowNewCustomer(true)}
                  >
                    <Feather name="plus-circle" size={16} color="#f97316" />
                    <Text style={{ color: '#f97316', fontWeight: '700', fontSize: 15 }}>New customer</Text>
                  </TouchableOpacity>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.custRow} onPress={() => selectCustomer(item)} activeOpacity={0.6}>
                    <Text style={s.custName}>{item.name}</Text>
                    {item.email && <Text style={s.custSub}>{item.email}</Text>}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: '#6b7280', textAlign: 'center', padding: 24 }}>No customers found</Text>}
              />
            </>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity onPress={() => setShowNewCustomer(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                <Feather name="chevron-left" size={16} color="#f97316" />
                <Text style={{ color: '#f97316', fontWeight: '600' }}>Back to search</Text>
              </TouchableOpacity>
              <Text style={s.label}>First name *</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={newCustFirstName} onChangeText={v => updateNewCustName(v, newCustLastName)} placeholder="First name" placeholderTextColor="#6b7280" autoFocus />
              <Text style={s.label}>Last name</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={newCustLastName} onChangeText={v => updateNewCustName(newCustFirstName, v)} placeholder="Last name" placeholderTextColor="#6b7280" />
              <Text style={s.label}>Email *</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={newCust.email} onChangeText={v => setNewCust(p => ({ ...p, email: v }))} placeholder="customer@email.com" placeholderTextColor="#6b7280" keyboardType="email-address" autoCapitalize="none" />
              <Text style={s.label}>Phone *</Text>
              <TextInput style={[s.input, { marginBottom: 14 }]} value={newCust.phone} onChangeText={v => setNewCust(p => ({ ...p, phone: v }))} placeholder="+64 21 000 0000" placeholderTextColor="#6b7280" keyboardType="phone-pad" />
              <Text style={s.label}>Billing address *</Text>
              <AddressAutocomplete style={[s.input, { marginBottom: 24 }]} value={newCust.billing_address} onChangeText={v => setNewCust(p => ({ ...p, billing_address: v }))} placeholder="Start typing an address…" />
              <TouchableOpacity
                style={[s.btn, (!newCustValid || creatingCust) && { opacity: 0.5 }]}
                onPress={createCustomer}
                disabled={!newCustValid || creatingCust}
              >
                {creatingCust ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Create customer</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Job site picker */}
      <Modal visible={showSitePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSitePicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select Job Site</Text>
            <TouchableOpacity onPress={() => setShowSitePicker(false)}>
              <Text style={s.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={sites}
            keyExtractor={site => site.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.custRow} onPress={() => { setSiteId(item.id); setShowSitePicker(false) }} activeOpacity={0.6}>
                <Text style={s.custName}>{item.label || 'Site'}</Text>
                <Text style={s.custSub}>{item.address}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  )
}

function LineItemRow({ item, onRemove }: { item: LineItem; onRemove: () => void }) {
  return (
    <View style={s.lineRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.lineDesc}>{item.description}</Text>
        <Text style={s.lineSub}>{item.quantity} {item.unit || 'ea'} × ${parseFloat(item.unit_price || '0').toFixed(2)}</Text>
      </View>
      <Text style={s.lineTotal}>${((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toFixed(2)}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={`Remove ${item.description}`} accessibilityRole="button">
        <Feather name="x" size={16} color="#d1d5db" />
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 },
  pickerVal: { fontSize: 15, color: '#111827' },
  pickerPh: { fontSize: 15, color: '#6b7280' },
  expiryChip: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  expiryChipActive: { backgroundColor: '#fff7ed', borderColor: '#f97316' },
  expiryChipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  expiryChipTextActive: { color: '#f97316' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  addLink: { fontSize: 14, color: '#f97316', fontWeight: '600', marginBottom: 10 },
  addItemBox: { backgroundColor: '#fff7ed', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fed7aa' },
  empty: { color: '#d1d5db', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  qSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 2 },
  qSectionTitle: { fontSize: 13, fontWeight: '700', color: '#f97316' },
  lineDesc: { fontSize: 14, color: '#374151', fontWeight: '500' },
  lineSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  lineTotal: { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 60, textAlign: 'right' },
  totals: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalRowFinal: { borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 4, paddingTop: 8 },
  totalLbl: { fontSize: 13, color: '#6b7280' },
  totalVal: { fontSize: 13, color: '#374151' },
  totalLblBold: { fontSize: 15, fontWeight: '700', color: '#111827' },
  totalValBold: { fontSize: 16, fontWeight: '800', color: '#111827' },
  btn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sendBtn: { backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  ghostBtn: { backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ghostBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 15 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalClose: { fontSize: 15, color: '#f97316', fontWeight: '600' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  custRow: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8 },
  custName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  custSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
})
