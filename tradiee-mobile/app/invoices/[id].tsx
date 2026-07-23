import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput, Platform, KeyboardAvoidingView, Linking,
} from 'react-native'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Icon, type IconName } from '@/lib/icons'
import { supabase } from '@/lib/supabase'
import { useTimezone, useCanTakePayments } from '@/lib/profile-context'
import { formatDate as formatDateTz } from '@/lib/datetime'
import { PriceListDescriptionInput, type PriceListLookupItem } from '@/components/PriceListDescriptionInput'
import { TAP_TO_PAY_EDUCATION_KEY } from '@/lib/tap-to-pay'

const STATUS_COLOR: Record<string, string> = {
  draft:          '#6b7280',
  sent:           '#3b82f6',
  partially_paid: '#f97316',
  paid:           '#22c55e',
  overdue:        '#ef4444',
  void:           '#9ca3af',
}

const STATUS_LABEL: Record<string, string> = {
  draft:          'Draft',
  sent:           'Sent',
  partially_paid: 'Partially Paid',
  paid:           'Paid',
  overdue:        'Overdue',
  void:           'Void',
}

type Invoice = {
  id: string
  invoice_number: string
  status: string
  subtotal: number
  gst_amount: number
  total: number
  amount_paid: number
  due_date: string | null
  invoice_date: string | null
  notes: string | null
  paid_at: string | null
  job_title: string | null
  customer_name: string | null
  discount_type: 'amount' | 'percent' | null
  discount_value: number | null
  discount_amount: number | null
  is_recurring: number
  recurrence_rule: string | null
  recurrence_next: string | null
  recurrence_end: string | null
}

type LineItem = {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  sort_order: number
}

function formatAmount(amount: number) {
  return '$' + (amount ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// $ value of a discount applied to `base`, clamped to [0, base]. Mirrors
// tradiee-app/lib/pricing.ts discountAmount() — kept minimal since mobile
// only supports a single document-level discount, no per-line discounts.
function discountAmount(base: number, type: 'amount' | 'percent' | null, value: number): number {
  if (!type || !value || base <= 0) return 0
  const raw = type === 'percent' ? (base * value) / 100 : value
  return round2(Math.min(Math.max(raw, 0), base))
}

export default function InvoiceDetailScreen() {
  const timezone = useTimezone()
  const canTakePayments = useCanTakePayments()
  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return formatDateTz(iso, timezone, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const { id } = useLocalSearchParams<{ id: string }>()
  const [recording, setRecording] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', notes: '' })
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    due_date: '', notes: '',
    discount_value: '0', discount_type: 'amount' as 'amount' | 'percent',
    is_recurring: false, recurrence_rule: 'monthly', recurrence_next: '', recurrence_end: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [gstRate, setGstRate] = useState(0.15)
  const [newLine, setNewLine] = useState({ price_list_item_id: null as string | null, description: '', quantity: '1', unit: 'each', unit_price: '' })
  const [savingLine, setSavingLine] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('company_id').eq('id', user.id).single().then(({ data: profile }) => {
        if (!profile?.company_id) return
        setCompanyId(profile.company_id)
        supabase.from('companies').select('default_gst_rate').eq('id', profile.company_id).single()
          .then(({ data: co }) => { if (co?.default_gst_rate != null) setGstRate(Number(co.default_gst_rate)) })
      })
    })
  }, [])

  const { data: priceItems } = useQuery<PriceListLookupItem>(
    `SELECT id, name, unit, sell_price, cost_price, category
     FROM price_list_items
     WHERE company_id = ? AND is_active = 1
     ORDER BY name ASC`,
    [companyId ?? '']
  )

  const { data: invoices, isLoading, refresh: refreshInvoice } = useQuery<Invoice>(
    `SELECT i.id, i.invoice_number, i.status, i.subtotal, i.gst_amount, i.total,
            i.amount_paid, i.due_date, i.invoice_date, i.notes, i.paid_at,
            i.discount_type, i.discount_value, i.discount_amount,
            i.is_recurring, i.recurrence_rule, i.recurrence_next, i.recurrence_end,
            j.title AS job_title,
            c.name AS customer_name
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ?`,
    [id]
  )
  const invoice = invoices?.[0]

  const { data: lineItems, refresh: refreshLineItems } = useQuery<LineItem>(
    `SELECT id, description, quantity, unit, unit_price, line_total, sort_order
     FROM invoice_line_items
     WHERE invoice_id = ?
     ORDER BY sort_order ASC`,
    [id]
  )

  // Recompute subtotal/gst/total from current line items + the invoice's
  // document-level discount. Mirrors tradiee-app's recompute() but flattened
  // to a single gstRate (mobile doesn't support per-line tax rates).
  async function recompute(discType: 'amount' | 'percent' | null, discValue: number) {
    const { data: lines } = await supabase.from('invoice_line_items').select('line_total').eq('invoice_id', id)
    const subtotal = round2((lines ?? []).reduce((s, l) => s + Number(l.line_total ?? 0), 0))
    const discount = discountAmount(subtotal, discType, discValue)
    const taxable = round2(subtotal - discount)
    const gst = round2(taxable * gstRate)
    const total = round2(taxable + gst)
    await supabase.from('invoices').update({ subtotal, discount_amount: discount, gst_amount: gst, total }).eq('id', id)
  }

  function pickPriceItem(item: PriceListLookupItem) {
    setNewLine({
      price_list_item_id: item.id,
      description: item.name,
      quantity: '1',
      unit: item.unit ?? 'each',
      unit_price: String(item.sell_price ?? item.cost_price ?? 0),
    })
  }

  async function addLine() {
    if (!invoice || !newLine.description.trim()) return
    if (invoice.status === 'paid') { Alert.alert('Invoice paid', 'Line items are locked on a paid invoice.'); return }
    const qty = parseFloat(newLine.quantity) || 1
    const price = parseFloat(newLine.unit_price) || 0
    setSavingLine(true)
    const { error } = await supabase.from('invoice_line_items').insert({
      invoice_id: id,
      price_list_item_id: newLine.price_list_item_id,
      type: 'misc',
      description: newLine.description.trim(),
      quantity: qty,
      unit: newLine.unit || 'each',
      unit_price: price,
      tax_rate: gstRate,
      line_total: round2(qty * price),
      sort_order: 99,
    })
    if (error) { setSavingLine(false); Alert.alert('Error', error.message); return }
    await recompute(invoice.discount_type, invoice.discount_value ?? 0)
    setSavingLine(false)
    setNewLine({ price_list_item_id: null, description: '', quantity: '1', unit: 'each', unit_price: '' })
    refreshLineItems?.()
    refreshInvoice?.()
  }

  function confirmDeleteLine(item: LineItem) {
    Alert.alert('Remove this line?', item.description, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('invoice_line_items').delete().eq('id', item.id)
          if (error) { Alert.alert('Error', error.message); return }
          if (invoice) await recompute(invoice.discount_type, invoice.discount_value ?? 0)
          refreshLineItems?.()
          refreshInvoice?.()
        },
      },
    ])
  }

  function openPayment() {
    if (!invoice) return
    const remaining = invoice.total - (invoice.amount_paid ?? 0)
    setPayForm({ amount: remaining > 0 ? remaining.toFixed(2) : '', method: 'cash', notes: '' })
    setShowPayment(true)
  }

  // Mirrors web invoices/[id]/client.tsx: insert a payments row, then update
  // amount_paid / status — never just force the invoice to paid.
  async function recordPayment() {
    if (!invoice) return
    const amount = parseFloat(payForm.amount)
    if (!amount || amount <= 0) { Alert.alert('Enter an amount', 'How much was paid?'); return }
    setRecording(true)
    const { error: payErr } = await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount,
      method: payForm.method,
      notes: payForm.notes.trim() || null,
      paid_at: new Date().toISOString(),
    })
    if (payErr) { setRecording(false); Alert.alert('Error', payErr.message); return }

    const newAmountPaid = (invoice.amount_paid ?? 0) + amount
    const newStatus = newAmountPaid >= invoice.total ? 'paid' : 'partially_paid'
    const { error } = await supabase.from('invoices').update({
      amount_paid: newAmountPaid,
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', id)
    setRecording(false)
    if (error) { Alert.alert('Error', error.message); return }

    if (newStatus === 'paid') {
      // Fire-and-forget review request — server enforces idempotency + opt-in.
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      supabase.auth.getSession().then(({ data: { session } }) => {
        fetch(`${apiBase}/api/invoices/${invoice.id}/review-request`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }).catch(() => {})
      })
    }
    setShowPayment(false)
    refreshInvoice?.()
  }

  async function viewPdf() {
    if (!invoice) return
    setLoadingPdf(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/invoices/${invoice.id}/pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not generate PDF')
      await Linking.openURL(json.url)
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not open PDF')
    } finally {
      setLoadingPdf(false)
    }
  }

  async function emailInvoice() {
    if (!invoice) return
    setEmailing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/email/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not send email')
      Alert.alert('Sent', 'Invoice emailed to the customer.')
      refreshInvoice?.()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not send email')
    } finally {
      setEmailing(false)
    }
  }

  function openEdit() {
    if (!invoice) return
    setEditForm({
      due_date: invoice.due_date?.slice(0, 10) ?? '',
      notes: invoice.notes ?? '',
      discount_value: String(invoice.discount_value ?? 0),
      discount_type: invoice.discount_type ?? 'amount',
      is_recurring: !!invoice.is_recurring,
      recurrence_rule: invoice.recurrence_rule ?? 'monthly',
      recurrence_next: invoice.recurrence_next?.slice(0, 10) ?? '',
      recurrence_end: invoice.recurrence_end?.slice(0, 10) ?? '',
    })
    setShowEdit(true)
  }

  async function saveEdit() {
    setSavingEdit(true)
    const discValue = parseFloat(editForm.discount_value) || 0
    const discType: 'amount' | 'percent' | null = discValue > 0 ? editForm.discount_type : null
    const { error } = await supabase.from('invoices').update({
      due_date: editForm.due_date.trim() || null,
      notes: editForm.notes.trim() || null,
      discount_type: discType,
      discount_value: discValue,
      is_recurring: editForm.is_recurring,
      recurrence_rule: editForm.is_recurring ? editForm.recurrence_rule : null,
      recurrence_next: editForm.is_recurring ? (editForm.recurrence_next.trim() || new Date().toISOString().slice(0, 10)) : null,
      recurrence_end: editForm.is_recurring ? (editForm.recurrence_end.trim() || null) : null,
    }).eq('id', id)
    if (error) { setSavingEdit(false); Alert.alert('Error', error.message); return }
    await recompute(discType, discValue)
    setSavingEdit(false)
    setShowEdit(false)
    refreshInvoice?.()
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  if (!invoice) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280' }}>Invoice not found</Text>
      </View>
    )
  }

  const color = STATUS_COLOR[invoice.status] ?? '#9ca3af'
  const isPaid = invoice.status === 'paid'

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <Stack.Screen options={{
        title: invoice.invoice_number, headerTintColor: '#f97316',
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <TouchableOpacity onPress={emailInvoice} disabled={emailing} hitSlop={10} accessibilityLabel="Email invoice to customer">
              {emailing ? <ActivityIndicator size="small" color="#f97316" /> : <Icon name="mail" size={20} color="#f97316" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={viewPdf} disabled={loadingPdf} hitSlop={10} accessibilityLabel="View invoice PDF">
              {loadingPdf ? <ActivityIndicator size="small" color="#f97316" /> : <Icon name="file-text" size={20} color="#f97316" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={openEdit} hitSlop={10} accessibilityLabel="Edit invoice">
              <Icon name="edit-2" size={20} color="#f97316" />
            </TouchableOpacity>
          </View>
        ),
      }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Info card */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.docNumber}>{invoice.invoice_number}</Text>
              {invoice.job_title && (
                <Text style={styles.docTitle}>{invoice.job_title}</Text>
              )}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
              <Text style={[styles.statusText, { color }]}>
                {STATUS_LABEL[invoice.status] ?? invoice.status}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Customer</Text>
            <Text style={styles.metaValue}>{invoice.customer_name ?? '—'}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Invoice Date</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.invoice_date)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Due Date</Text>
            <Text style={styles.metaValue}>{formatDate(invoice.due_date)}</Text>
          </View>
          {isPaid && invoice.paid_at && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Paid On</Text>
              <Text style={[styles.metaValue, { color: '#22c55e' }]}>{formatDate(invoice.paid_at)}</Text>
            </View>
          )}
          {invoice.notes && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Notes</Text>
              <Text style={[styles.metaValue, { flex: 1 }]} numberOfLines={3}>{invoice.notes}</Text>
            </View>
          )}
        </View>

        {/* Line items */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Line Items</Text>

          {(lineItems ?? []).length === 0 ? (
            <Text style={{ fontSize: 13, color: '#9ca3af', paddingVertical: 6 }}>No line items yet</Text>
          ) : (lineItems ?? []).map(item => (
            <TouchableOpacity key={item.id} style={styles.lineRow} onLongPress={() => confirmDeleteLine(item)} activeOpacity={0.6}>
              <Text style={styles.lineDesc} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.lineQty}>{item.quantity} {item.unit}</Text>
              <Text style={styles.lineTotal}>{formatAmount(item.line_total ?? 0)}</Text>
              <TouchableOpacity onPress={() => confirmDeleteLine(item)} hitSlop={8} accessibilityLabel={`Remove ${item.description}`}>
                <Icon name="x" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          {/* Add line — locked once the invoice is fully paid */}
          {isPaid ? (
            <Text style={{ fontSize: 13, color: '#9ca3af', paddingTop: 12 }}>Invoice paid — line items are locked.</Text>
          ) : (
          <View style={[styles.lineRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8, paddingTop: 12 }]}>
            <PriceListDescriptionInput
              value={newLine.description}
              items={priceItems ?? []}
              onChangeText={v => setNewLine(f => ({ ...f, description: v, price_list_item_id: null }))}
              onPick={pickPriceItem}
              placeholder="Add a line item…"
              inputStyle={styles.lineInput}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[styles.lineInput, { flex: 1 }]} value={newLine.quantity} onChangeText={v => setNewLine(f => ({ ...f, quantity: v }))} placeholder="Qty" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
              <TextInput style={[styles.lineInput, { flex: 1 }]} value={newLine.unit} onChangeText={v => setNewLine(f => ({ ...f, unit: v }))} placeholder="Unit" placeholderTextColor="#9ca3af" />
              <TextInput style={[styles.lineInput, { flex: 1 }]} value={newLine.unit_price} onChangeText={v => setNewLine(f => ({ ...f, unit_price: v }))} placeholder="Price" placeholderTextColor="#9ca3af" keyboardType="decimal-pad" />
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, { paddingVertical: 12 }, (!newLine.description.trim() || savingLine) && { opacity: 0.5 }]}
              onPress={addLine}
              disabled={!newLine.description.trim() || savingLine}
            >
              {savingLine ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Add line</Text>}
            </TouchableOpacity>
          </View>
          )}

          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatAmount(invoice.subtotal ?? 0)}</Text>
            </View>
            {(invoice.discount_amount ?? 0) > 0 && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#16a34a' }]}>Discount</Text>
                <Text style={[styles.totalValue, { color: '#16a34a' }]}>−{formatAmount(invoice.discount_amount ?? 0)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST</Text>
              <Text style={styles.totalValue}>{formatAmount(invoice.gst_amount ?? 0)}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalRowFinal]}>
              <Text style={styles.totalLabelBold}>Total</Text>
              <Text style={styles.totalValueBold}>{formatAmount(invoice.total ?? 0)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom actions */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        {isPaid ? (
          <View style={[styles.payBtn, styles.payBtnDisabled]}>
            <Icon name="check-circle" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Paid</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.tapPayBtn, !canTakePayments && styles.tapPayBtnDisabled]}
              onPress={async () => {
                // Card-present is a paid-plan feature (server also enforces it).
                if (!canTakePayments) {
                  Alert.alert(
                    'Subscribe to use Tap to Pay',
                    'Tap to Pay is available on a paid plan. Subscribe in Settings to take card payments in person.',
                    [{ text: 'OK' }]
                  )
                  return
                }
                // Apple Tap to Pay review requirement 4.2: show education once before first use.
                const seen = await AsyncStorage.getItem(TAP_TO_PAY_EDUCATION_KEY)
                const dest = seen ? `/pay-now?invoiceId=${id}` : `/tap-to-pay-help?next=${encodeURIComponent(`/pay-now?invoiceId=${id}`)}`
                router.push(dest as never)
              }}
              activeOpacity={0.85}
            >
              <Icon name="credit-card" size={16} color="#fff" />
              <Text style={styles.tapPayBtnText}>Tap to Pay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={openPayment}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Record a manual payment"
            >
              <Text style={styles.manualBtnText}>Manual</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Record payment modal */}
      <Modal visible={showPayment} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !recording && setShowPayment(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => !recording && setShowPayment(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
              {invoice && (invoice.amount_paid ?? 0) > 0 && (
                <Text style={{ fontSize: 13, color: '#6b7280' }}>
                  {`$${(invoice.amount_paid ?? 0).toFixed(2)} of $${invoice.total.toFixed(2)} already paid`}
                </Text>
              )}
              <Text style={styles.metaLabel}>Amount</Text>
              <TextInput
                style={styles.input}
                value={payForm.amount}
                onChangeText={v => setPayForm(f => ({ ...f, amount: v }))}
                placeholder="0.00"
                placeholderTextColor="#6b7280"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.metaLabel}>Method</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {([['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['other', 'Other']] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.methodChip, payForm.method === key && styles.methodChipActive]}
                    onPress={() => setPayForm(f => ({ ...f, method: key }))}
                    accessibilityRole="button"
                    accessibilityLabel={`Payment method: ${label}`}
                  >
                    <Text style={[styles.methodChipText, payForm.method === key && styles.methodChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.metaLabel}>Notes (optional)</Text>
              <TextInput
                style={styles.input}
                value={payForm.notes}
                onChangeText={v => setPayForm(f => ({ ...f, notes: v }))}
                placeholder="e.g. paid cash on site"
                placeholderTextColor="#6b7280"
              />
              <TouchableOpacity style={[styles.saveBtn, recording && { opacity: 0.5 }]} onPress={recordPayment} disabled={recording} activeOpacity={0.85}>
                {recording ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Record payment</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Invoice</Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.metaLabel}>Due date (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={editForm.due_date} onChangeText={v => setEditForm(f => ({ ...f, due_date: v }))} placeholder="2026-08-01" placeholderTextColor="#6b7280" />
            <Text style={styles.metaLabel}>Notes</Text>
            <TextInput
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              value={editForm.notes}
              onChangeText={v => setEditForm(f => ({ ...f, notes: v }))}
              placeholder="Notes shown on the invoice…"
              placeholderTextColor="#6b7280"
              multiline
            />
            <Text style={[styles.metaLabel, { marginTop: 8 }]}>Discount</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={editForm.discount_value}
                onChangeText={v => setEditForm(f => ({ ...f, discount_value: v }))}
                placeholder="0.00"
                placeholderTextColor="#6b7280"
                keyboardType="decimal-pad"
              />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['amount', 'percent'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.methodChip, editForm.discount_type === t && styles.methodChipActive]}
                    onPress={() => setEditForm(f => ({ ...f, discount_type: t }))}
                    accessibilityRole="button"
                    accessibilityLabel={t === 'amount' ? 'Dollar discount' : 'Percent discount'}
                  >
                    <Text style={[styles.methodChipText, editForm.discount_type === t && styles.methodChipTextActive]}>{t === 'amount' ? '$' : '%'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={[styles.metaLabel, { marginTop: 0 }]}>Repeat this invoice</Text>
              <TouchableOpacity
                onPress={() => setEditForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
                style={[styles.recurringToggle, editForm.is_recurring && styles.recurringToggleActive]}
                accessibilityRole="switch"
                accessibilityState={{ checked: editForm.is_recurring }}
              >
                <View style={[styles.recurringThumb, editForm.is_recurring && styles.recurringThumbActive]} />
              </TouchableOpacity>
            </View>
            {editForm.is_recurring && (
              <>
                <Text style={styles.metaLabel}>Every</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {([['weekly', 'Week'], ['fortnightly', 'Fortnight'], ['monthly', 'Month'], ['quarterly', 'Quarter'], ['yearly', 'Year']] as const).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.methodChip, editForm.recurrence_rule === key && styles.methodChipActive]}
                      onPress={() => setEditForm(f => ({ ...f, recurrence_rule: key }))}
                    >
                      <Text style={[styles.methodChipText, editForm.recurrence_rule === key && styles.methodChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.metaLabel}>Next issue (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={editForm.recurrence_next} onChangeText={v => setEditForm(f => ({ ...f, recurrence_next: v }))} placeholder="2026-08-01" placeholderTextColor="#6b7280" />
                <Text style={styles.metaLabel}>End (optional, YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={editForm.recurrence_end} onChangeText={v => setEditForm(f => ({ ...f, recurrence_end: v }))} placeholder="Leave blank for no end date" placeholderTextColor="#6b7280" />
              </>
            )}

            <TouchableOpacity style={[styles.saveBtn, savingEdit && { opacity: 0.5 }]} onPress={saveEdit} disabled={savingEdit} activeOpacity={0.85}>
              {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
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
  saveBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  methodChip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  methodChipActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  methodChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  methodChipTextActive: { color: '#c2410c' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  docNumber: { fontSize: 12, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  docTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statusBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  metaLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', textAlign: 'right' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  lineDesc: { flex: 1, fontSize: 14, color: '#374151' },
  lineQty: { fontSize: 13, color: '#6b7280', minWidth: 56, textAlign: 'right' },
  lineTotal: { fontSize: 14, fontWeight: '600', color: '#111827', minWidth: 72, textAlign: 'right' },
  lineInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  recurringToggle: { width: 46, height: 28, borderRadius: 14, backgroundColor: '#e5e7eb', padding: 3, justifyContent: 'center' },
  recurringToggleActive: { backgroundColor: '#f97316' },
  recurringThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  recurringThumbActive: { alignSelf: 'flex-end' },
  totalsBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalRowFinal: { marginTop: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 },
  totalLabel: { fontSize: 13, color: '#6b7280' },
  totalValue: { fontSize: 13, color: '#374151' },
  totalLabelBold: { fontSize: 15, fontWeight: '700', color: '#111827' },
  totalValueBold: { fontSize: 15, fontWeight: '700', color: '#111827' },
  bottomBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  payBtn: { backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  payBtnDisabled: { backgroundColor: '#9ca3af' },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10 },
  tapPayBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16 },
  tapPayBtnDisabled: { backgroundColor: '#9ca3af', opacity: 0.6 },
  tapPayBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  manualBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 16 },
  manualBtnText: { color: '#374151', fontSize: 14, fontWeight: '600' },
})
