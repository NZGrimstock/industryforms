import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'

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

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [recording, setRecording] = useState(false)

  const { data: invoices, isLoading } = useQuery<Invoice>(
    `SELECT i.id, i.invoice_number, i.status, i.subtotal, i.gst_amount, i.total,
            i.amount_paid, i.due_date, i.invoice_date, i.notes, i.paid_at,
            j.title AS job_title,
            c.name AS customer_name
     FROM invoices i
     LEFT JOIN jobs j ON j.id = i.job_id
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ?`,
    [id]
  )
  const invoice = invoices?.[0]

  const { data: lineItems } = useQuery<LineItem>(
    `SELECT id, description, quantity, unit, unit_price, line_total, sort_order
     FROM invoice_line_items
     WHERE invoice_id = ?
     ORDER BY sort_order ASC`,
    [id]
  )

  async function recordPayment() {
    setRecording(true)
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
    setRecording(false)
    if (error) Alert.alert('Error', error.message)
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
        <Text style={{ color: '#9ca3af' }}>Invoice not found</Text>
      </View>
    )
  }

  const color = STATUS_COLOR[invoice.status] ?? '#9ca3af'
  const isPaid = invoice.status === 'paid'

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <Stack.Screen options={{ title: invoice.invoice_number, headerTintColor: '#f97316' }} />
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
        {(lineItems ?? []).length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Line Items</Text>

            {(lineItems ?? []).map(item => (
              <View key={item.id} style={styles.lineRow}>
                <Text style={styles.lineDesc} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.lineQty}>{item.quantity} {item.unit}</Text>
                <Text style={styles.lineTotal}>{formatAmount(item.line_total ?? 0)}</Text>
              </View>
            ))}

            <View style={styles.totalsBox}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{formatAmount(invoice.subtotal ?? 0)}</Text>
              </View>
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
        )}
      </ScrollView>

      {/* Bottom actions */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        {isPaid ? (
          <View style={[styles.payBtn, styles.payBtnDisabled]}>
            <Feather name="check-circle" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Paid</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.tapPayBtn]}
              onPress={() => router.push(`/pay-now?invoiceId=${id}`)}
              activeOpacity={0.85}
            >
              <Feather name="credit-card" size={16} color="#fff" />
              <Text style={styles.tapPayBtnText}>Tap to Pay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.manualBtn, recording && { opacity: 0.5 }]}
              onPress={recordPayment}
              disabled={recording}
              activeOpacity={0.85}
            >
              {recording
                ? <ActivityIndicator color="#374151" size="small" />
                : <Text style={styles.manualBtnText}>Manual</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  docNumber: { fontSize: 12, color: '#9ca3af', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  docTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statusBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  statusText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  metaLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', textAlign: 'right' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
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
  bottomBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  payBtn: { backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  payBtnDisabled: { backgroundColor: '#9ca3af' },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10 },
  tapPayBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16 },
  tapPayBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  manualBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 14, paddingVertical: 16 },
  manualBtnText: { color: '#374151', fontSize: 14, fontWeight: '600' },
})
