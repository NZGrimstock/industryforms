import { useState, useRef, type RefObject } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity,
  Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { PriceListDescriptionInput, type PriceListLookupItem } from '@/components/PriceListDescriptionInput'
import { useTimezone } from '@/lib/profile-context'
import { formatDate as formatDateTz } from '@/lib/datetime'
import { scrollFieldAboveKeyboard } from '@/lib/keyboard'

const STATUS_COLOR: Record<string, string> = {
  draft:    '#6b7280',
  sent:     '#3b82f6',
  accepted: '#22c55e',
  declined: '#ef4444',
  expired:  '#9ca3af',
}

const STATUS_LABEL: Record<string, string> = {
  draft:    'Draft',
  sent:     'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired:  'Expired',
}

type Quote = {
  id: string
  quote_number: string
  title: string
  status: string
  subtotal: number
  gst_amount: number
  total: number
  customer_name: string | null
  customer_phone: string | null
  customer_id: string | null
  company_id: string | null
  expires_at: string | null
  customer_message: string | null
  notes: string | null
}

type Section = { id: string; title: string; sort_order: number }

type LineItem = {
  id: string
  section_id: string | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  sort_order: number
}

function fmt(amount: number) {
  return '$' + (amount ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

let _uid = 0

export default function QuoteDetailScreen() {
  const timezone = useTimezone()
  const fmtDate = (iso: string | null) => iso ? formatDateTz(iso, timezone, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const { id } = useLocalSearchParams<{ id: string }>()
  const scrollRef = useRef<ScrollView>(null)
  const itemQtyRef = useRef<TextInput>(null)
  const itemUnitRef = useRef<TextInput>(null)
  const itemPriceRef = useRef<TextInput>(null)
  const [sending, setSending] = useState(false)
  const [texting, setTexting] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState({ description: '', quantity: '1', unit: 'ea', unit_price: '', price_list_item_id: null as string | null })
  const [addingItem, setAddingItem] = useState(false)
  const [editingItem, setEditingItem] = useState<LineItem | null>(null)
  const [editForm, setEditForm] = useState({ description: '', quantity: '1', unit_price: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const focusField = (ref: RefObject<TextInput | null>) => {
    setTimeout(() => scrollFieldAboveKeyboard(scrollRef, ref, 12), 50)
  }

  const { data: quotes, isLoading, refresh: refreshQuote } = useQuery<Quote>(
    `SELECT q.id, q.quote_number, q.title, q.status, q.subtotal, q.gst_amount, q.total,
            q.expires_at, q.customer_message, q.notes,
            q.customer_id, q.company_id,
            c.name AS customer_name, c.phone AS customer_phone
     FROM quotes q
     LEFT JOIN customers c ON c.id = q.customer_id
     WHERE q.id = ?`,
    [id]
  )
  const quote = quotes?.[0]

  const { data: priceItems } = useQuery<PriceListLookupItem>(
    `SELECT id, name, unit, sell_price, cost_price, category
     FROM price_list_items
     WHERE company_id = ? AND is_active = 1
     ORDER BY name ASC`,
    [quote?.company_id ?? '']
  )

  const { data: sections } = useQuery<Section>(
    `SELECT id, title, sort_order FROM quote_sections WHERE quote_id = ? ORDER BY sort_order ASC`,
    [id]
  )

  const { data: lineItems, refresh: refreshItems } = useQuery<LineItem>(
    `SELECT id, section_id, description, quantity, unit, unit_price, line_total, sort_order
     FROM quote_line_items WHERE quote_id = ? ORDER BY sort_order ASC`,
    [id]
  )

  async function sendByEmail() {
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/email/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ quoteId: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send')
      Alert.alert('Sent!', 'Quote emailed to customer.')
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not send email')
    } finally {
      setSending(false)
    }
  }

  async function sendByText() {
    setTexting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/sms/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ quoteId: id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send')
      Alert.alert('Sent!', 'Quote texted to customer.')
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not send text')
    } finally {
      setTexting(false)
    }
  }

  async function declineQuote() {
    if (!quote) return
    Alert.alert(
      'Decline Quote',
      `Mark "${quote.title}" as declined?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive', onPress: async () => {
            setDeclining(true)
            const { error } = await supabase.from('quotes')
              .update({ status: 'declined', declined_at: new Date().toISOString() })
              .eq('id', id!)
            setDeclining(false)
            if (error) { Alert.alert('Error', error.message); return }
            refreshQuote?.()
          },
        },
      ]
    )
  }

  async function acceptQuote() {
    if (!quote) return
    Alert.alert(
      'Accept Quote',
      `Accept "${quote.title}" and auto-create a job?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept & Create Job', onPress: async () => {
            setAccepting(true)
            try {
              // Mark quote as accepted
              await supabase.from('quotes').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', id!)
              // Create job via API
              const { data: { session } } = await supabase.auth.getSession()
              const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
              const res = await fetch(`${apiBase}/api/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                body: JSON.stringify({
                  title: quote.title,
                  description: quote.customer_message ?? undefined,
                  customer_id: quote.customer_id ?? undefined,
                  quote_id: id,
                }),
              })
              const json = await res.json()
              if (!res.ok) throw new Error(json.error ?? 'Could not create job')
              router.push(`/jobs/${json.id}`)
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not accept quote')
            } finally {
              setAccepting(false)
            }
          },
        },
      ]
    )
  }

  async function convertToJob() {
    if (!quote) return
    Alert.alert(
      'Convert to Job',
      `Create a new job from "${quote.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Job', onPress: async () => {
            setConverting(true)
            try {
              const { data: { session } } = await supabase.auth.getSession()
              const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
              const res = await fetch(`${apiBase}/api/jobs`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                  title: quote.title,
                  description: quote.customer_message ?? undefined,
                  customer_id: quote.customer_id ?? undefined,
                  quote_id: id,
                }),
              })
              const json = await res.json()
              if (!res.ok) throw new Error(json.error ?? 'Could not create job')
              router.push(`/jobs/${json.id}`)
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not create job')
            } finally {
              setConverting(false)
            }
          },
        },
      ]
    )
  }

  function startEdit(item: LineItem) {
    setEditingItem(item)
    setEditForm({
      description: item.description,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
    })
  }

  async function saveEdit() {
    if (!editingItem) return
    setSavingEdit(true)
    const qty = parseFloat(editForm.quantity) || 1
    const price = parseFloat(editForm.unit_price) || 0
    const { error } = await supabase.from('quote_line_items').update({
      description: editForm.description.trim(),
      quantity: qty,
      unit_price: price,
      line_total: qty * price,
    }).eq('id', editingItem.id)
    setSavingEdit(false)
    if (error) { Alert.alert('Error', error.message); return }
    setEditingItem(null)
    refreshItems?.()
  }

  async function deleteLineItem(itemId: string) {
    Alert.alert('Remove item', 'Remove this line item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.from('quote_line_items').delete().eq('id', itemId)
          refreshItems?.()
        },
      },
    ])
  }

  async function addLineItem() {
    if (!newItem.description.trim() || !newItem.unit_price || !id) return
    setAddingItem(true)
    const qty = parseFloat(newItem.quantity) || 1
    const price = parseFloat(newItem.unit_price) || 0
    const { error } = await supabase.from('quote_line_items').insert({
      quote_id: id,
      company_id: quote?.company_id,
      price_list_item_id: newItem.price_list_item_id,
      description: newItem.description.trim(),
      quantity: qty,
      unit_price: price,
      line_total: qty * price,
      unit: newItem.unit || 'ea',
      sort_order: (lineItems?.length ?? 0) + ++_uid,
    })
    setAddingItem(false)
    if (error) { Alert.alert('Error', error.message); return }
    setNewItem({ description: '', quantity: '1', unit: 'ea', unit_price: '', price_list_item_id: null })
    setShowAddItem(false)
    refreshItems?.()
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  if (!quote) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280' }}>Quote not found</Text>
      </View>
    )
  }

  const color = STATUS_COLOR[quote.status] ?? '#9ca3af'
  const isDraft = quote.status === 'draft'
  const isSent = quote.status === 'sent' || quote.status === 'viewed'
  const isAccepted = quote.status === 'accepted'
  const hasPhone = !!quote.customer_phone

  const sectionMap = new Map<string, LineItem[]>()
  const unsectioned: LineItem[] = []
  for (const item of lineItems ?? []) {
    if (item.section_id) {
      const arr = sectionMap.get(item.section_id) ?? []
      arr.push(item)
      sectionMap.set(item.section_id, arr)
    } else {
      unsectioned.push(item)
    }
  }

  const subtotal = (lineItems ?? []).reduce((sum, i) => sum + (i.line_total ?? 0), 0)

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <Stack.Screen options={{ title: quote.quote_number, headerTintColor: '#f97316' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 260 }} keyboardShouldPersistTaps="handled">

        {/* Info card */}
        <View style={s.card}>
          <View style={s.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.docNum}>{quote.quote_number}</Text>
              <Text style={s.docTitle}>{quote.title}</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: color + '20' }]}>
              <Text style={[s.statusText, { color }]}>{STATUS_LABEL[quote.status] ?? quote.status}</Text>
            </View>
          </View>

          {quote.customer_message && (
            <Text style={s.desc}>{quote.customer_message}</Text>
          )}

          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Customer</Text>
            <Text style={s.metaValue}>{quote.customer_name ?? '—'}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Valid until</Text>
            <Text style={s.metaValue}>{fmtDate(quote.expires_at)}</Text>
          </View>
          {quote.notes && (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Notes</Text>
              <Text style={[s.metaValue, { flex: 1 }]} numberOfLines={3}>{quote.notes}</Text>
            </View>
          )}

          {/* Action buttons */}
          {(isDraft || isSent || isAccepted) && (
            <View style={s.actionRow}>
              {isSent && (
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: '#22c55e' }, accepting && { opacity: 0.6 }]}
                  onPress={acceptQuote}
                  disabled={accepting}
                  activeOpacity={0.85}
                >
                  {accepting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Feather name="check-circle" size={14} color="#fff" /><Text style={s.actionBtnText}> Accept &amp; Create Job</Text></>
                  }
                </TouchableOpacity>
              )}
              {isSent && (
                <TouchableOpacity
                  style={[s.actionBtn, s.declineBtn, declining && { opacity: 0.6 }]}
                  onPress={declineQuote}
                  disabled={declining}
                  activeOpacity={0.85}
                  accessibilityLabel="Decline quote"
                >
                  {declining
                    ? <ActivityIndicator color="#ef4444" size="small" />
                    : <><Feather name="x-circle" size={14} color="#ef4444" /><Text style={[s.actionBtnText, { color: '#ef4444' }]}> Decline</Text></>
                  }
                </TouchableOpacity>
              )}
              {isDraft && (
                <TouchableOpacity
                  style={[s.actionBtn, s.sendBtn, sending && { opacity: 0.6 }]}
                  onPress={sendByEmail}
                  disabled={sending}
                  activeOpacity={0.85}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Feather name="send" size={14} color="#fff" /><Text style={s.actionBtnText}> Send by email</Text></>
                  }
                </TouchableOpacity>
              )}
              {isDraft && (
                <TouchableOpacity
                  style={[s.actionBtn, s.textBtn, (texting || !hasPhone) && { opacity: 0.5 }]}
                  onPress={sendByText}
                  disabled={texting || !hasPhone}
                  activeOpacity={0.85}
                  accessibilityLabel="Send quote by text message"
                >
                  {texting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Feather name="message-square" size={14} color="#fff" /><Text style={s.actionBtnText}> Send by text</Text></>
                  }
                </TouchableOpacity>
              )}
              {isAccepted && (
                <TouchableOpacity
                  style={[s.actionBtn, s.convertBtn, converting && { opacity: 0.6 }]}
                  onPress={convertToJob}
                  disabled={converting}
                  activeOpacity={0.85}
                >
                  {converting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Feather name="briefcase" size={14} color="#fff" /><Text style={s.actionBtnText}> Convert to Job</Text></>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}
          {isDraft && !hasPhone && (
            <Text style={s.actionHint}>Customer has no phone number — add one to send by text</Text>
          )}
        </View>

        {/* Line items */}
        <View style={s.card}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Materials</Text>
            {isDraft && (
              <TouchableOpacity onPress={() => setShowAddItem(v => !v)}>
                <Text style={s.addLink}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {showAddItem && isDraft && (
            <View style={s.addItemBox}>
              <PriceListDescriptionInput
                value={newItem.description}
                items={priceItems ?? []}
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
                <TouchableOpacity style={[s.miniBtn, s.miniBtnOrange, addingItem && { opacity: 0.5 }]} onPress={addLineItem} disabled={addingItem}>
                  {addingItem ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.miniBtnTextWhite}>Add</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.miniBtn, s.miniBtnGhost]} onPress={() => setShowAddItem(false)}>
                  <Text style={s.miniBtnTextGray}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(lineItems ?? []).length === 0 && !showAddItem ? (
            <Text style={s.empty}>No materials</Text>
          ) : (
            <>
              {unsectioned.map(item => (
                <LineRow
                  key={item.id}
                  item={item}
                  isDraft={isDraft}
                  onEdit={() => startEdit(item)}
                  onDelete={() => deleteLineItem(item.id)}
                />
              ))}
              {(sections ?? []).map(section => {
                const items = sectionMap.get(section.id) ?? []
                if (items.length === 0) return null
                return (
                  <View key={section.id}>
                    <Text style={s.sectionHeader}>{section.title}</Text>
                    {items.map(item => (
                      <LineRow
                        key={item.id}
                        item={item}
                        isDraft={isDraft}
                        onEdit={() => startEdit(item)}
                        onDelete={() => deleteLineItem(item.id)}
                      />
                    ))}
                  </View>
                )
              })}
              <View style={s.totalsBox}>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Subtotal</Text>
                  <Text style={s.totalValue}>{fmt(subtotal)}</Text>
                </View>
                <View style={[s.totalRow, s.totalRowFinal]}>
                  <Text style={s.totalLabelBold}>Total</Text>
                  <Text style={s.totalValueBold}>{fmt(quote.total ?? 0)}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit line item modal */}
      {editingItem && (
        <View style={s.editOverlay}>
          <View style={s.editSheet}>
            <Text style={s.editTitle}>Edit Line Item</Text>
            <TextInput
              style={[s.input, { marginBottom: 8 }]}
              value={editForm.description}
              onChangeText={v => setEditForm(p => ({ ...p, description: v }))}
              placeholder="Description"
              placeholderTextColor="#6b7280"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={editForm.quantity}
                onChangeText={v => setEditForm(p => ({ ...p, quantity: v }))}
                placeholder="Qty"
                keyboardType="decimal-pad"
                placeholderTextColor="#6b7280"
              />
              <TextInput
                style={[s.input, { flex: 2 }]}
                value={editForm.unit_price}
                onChangeText={v => setEditForm(p => ({ ...p, unit_price: v }))}
                placeholder="Unit price ($)"
                keyboardType="decimal-pad"
                placeholderTextColor="#6b7280"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[s.miniBtn, s.miniBtnOrange, savingEdit && { opacity: 0.5 }]}
                onPress={saveEdit}
                disabled={savingEdit}
              >
                {savingEdit
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.miniBtnTextWhite}>Save</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={[s.miniBtn, s.miniBtnGhost]} onPress={() => setEditingItem(null)}>
                <Text style={s.miniBtnTextGray}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

function LineRow({ item, isDraft, onEdit, onDelete }: {
  item: LineItem
  isDraft: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <View style={s.lineRow}>
      <TouchableOpacity style={{ flex: 1 }} onPress={isDraft ? onEdit : undefined} activeOpacity={isDraft ? 0.6 : 1}>
        <Text style={s.lineDesc} numberOfLines={2}>{item.description}</Text>
        <Text style={s.lineQty}>{item.quantity} {item.unit}</Text>
      </TouchableOpacity>
      <Text style={s.lineTotal}>{fmt(item.line_total ?? 0)}</Text>
      {isDraft && (
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }} accessibilityLabel="Remove line item" accessibilityRole="button">
          <Feather name="trash-2" size={16} color="#ef4444" />
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  docNum: { fontSize: 12, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  docTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statusBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '700' },
  desc: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  metaLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', textAlign: 'right' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13 },
  sendBtn: { backgroundColor: '#3b82f6' },
  textBtn: { backgroundColor: '#f97316' },
  declineBtn: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  convertBtn: { backgroundColor: '#22c55e' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionHint: { fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  addLink: { fontSize: 14, color: '#f97316', fontWeight: '600', marginBottom: 10 },
  addItemBox: { backgroundColor: '#fff7ed', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fed7aa' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#f97316', marginTop: 10, marginBottom: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  lineDesc: { flex: 1, fontSize: 14, color: '#374151' },
  lineQty: { fontSize: 13, color: '#6b7280', minWidth: 56, textAlign: 'right' },
  lineTotal: { fontSize: 14, fontWeight: '600', color: '#111827', minWidth: 72, textAlign: 'right' },
  totalsBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalRowFinal: { marginTop: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 },
  totalLabel: { fontSize: 13, color: '#6b7280' },
  totalValue: { fontSize: 13, color: '#374151' },
  totalLabelBold: { fontSize: 15, fontWeight: '700', color: '#111827' },
  totalValueBold: { fontSize: 15, fontWeight: '700', color: '#111827' },
  empty: { color: '#d1d5db', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  miniBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  miniBtnOrange: { backgroundColor: '#f97316' },
  miniBtnGhost: { backgroundColor: '#f3f4f6' },
  miniBtnTextWhite: { color: '#fff', fontWeight: '700', fontSize: 14 },
  miniBtnTextGray: { color: '#6b7280', fontWeight: '600', fontSize: 14 },
  editOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  editSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  editTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 14 },
})
