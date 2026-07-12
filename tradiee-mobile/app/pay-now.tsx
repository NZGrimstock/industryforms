import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native'
import { Stack, useLocalSearchParams, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon, type IconName } from '@/lib/icons'
import { requestNeededAndroidPermissions, useStripeTerminal, type Reader } from '@stripe/stripe-terminal-react-native'
import { supabase } from '@/lib/supabase'
import { fetchTerminalPaymentIntent, STRIPE_TERMINAL_LOCATION_ID } from '@/lib/tap-to-pay'

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

type InvoiceSummary = {
  id: string
  invoice_number: string
  customer_name: string | null
  job_title: string | null
  total: number
  amount_paid: number
  outstanding: number
  status: string
}

type PayStage =
  | 'select'       // browsing invoices
  | 'confirm'      // invoice selected, show amount + Start button
  | 'connecting'   // easyConnect in progress
  | 'collecting'   // collectPaymentMethod — SDK shows native tap UI
  | 'confirming'   // confirmPaymentIntent
  | 'success'
  | 'error'

function fmt(amount: number) {
  return '$' + (amount ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const maybe = error as { message?: string; code?: string }
    if (maybe.message && maybe.code) return `${maybe.code}: ${maybe.message}`
    if (maybe.message) return maybe.message
  }
  return 'Something went wrong while collecting the payment.'
}

const STATUS_COLOR: Record<string, string> = {
  draft:          '#6b7280',
  sent:           '#3b82f6',
  partially_paid: '#f97316',
  overdue:        '#ef4444',
}

export default function PayNowScreen() {
  const { invoiceId: preselectedId } = useLocalSearchParams<{ invoiceId?: string }>()
  const discoveredReaders = useRef<Reader.Type[]>([])

  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<InvoiceSummary | null>(null)
  const [stage, setStage] = useState<PayStage>(preselectedId ? 'confirm' : 'select')
  const [errorMsg, setErrorMsg] = useState('')
  const {
    initialize,
    isInitialized,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: readers => {
      discoveredReaders.current = readers
    },
  })

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    if (!prof) return

    // If navigating from a specific invoice, fetch it directly (bypasses status filter)
    if (preselectedId) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, amount_paid, customers(name), jobs(title)')
        .eq('id', preselectedId)
        .eq('company_id', prof.company_id)
        .single()
      if (inv) {
        const total = Number(inv.total)
        const paid = Number(inv.amount_paid)
        const cust = (Array.isArray(inv.customers) ? inv.customers[0] : inv.customers) as { name: string } | null
        const job  = (Array.isArray(inv.jobs) ? inv.jobs[0] : inv.jobs) as { title: string } | null
        const row: InvoiceSummary = {
          id: inv.id,
          invoice_number: inv.invoice_number,
          customer_name: cust?.name ?? null,
          job_title: job?.title ?? null,
          total,
          amount_paid: paid,
          outstanding: total - paid,
          status: inv.status,
        }
        setSelected(row)
        setInvoices([row])
        return
      }
    }

    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total, amount_paid, customers(name), jobs(title)')
      .eq('company_id', prof.company_id)
      .not('status', 'eq', 'paid')
      .order('created_at', { ascending: false })
      .limit(100)

    const rows: InvoiceSummary[] = (data ?? [])
      .map(i => {
        const total = Number(i.total)
        const paid = Number(i.amount_paid)
        const cust = (Array.isArray(i.customers) ? i.customers[0] : i.customers) as { name: string } | null
        const job  = (Array.isArray(i.jobs) ? i.jobs[0] : i.jobs) as { title: string } | null
        return {
          id: i.id,
          invoice_number: i.invoice_number,
          customer_name: cust?.name ?? null,
          job_title: job?.title ?? null,
          total,
          amount_paid: paid,
          outstanding: total - paid,
          status: i.status,
        }
      })
      .filter(r => r.outstanding > 0)
    setInvoices(rows)
  }, [preselectedId])

  useEffect(() => {
    fetchInvoices().finally(() => setLoading(false))
  }, [fetchInvoices])

  async function onRefresh() { setRefreshing(true); await fetchInvoices(); setRefreshing(false) }

  function selectInvoice(inv: InvoiceSummary) {
    setSelected(inv)
    setStage('confirm')
  }

  async function startPayment() {
    if (!selected) return
    setErrorMsg('')

    try {
      // Codex build audit marker (2026-07-07): real Stripe Terminal Tap to Pay collect-confirm flow.
      if (!API_BASE) throw new Error('Missing EXPO_PUBLIC_API_URL.')
      if (!STRIPE_TERMINAL_LOCATION_ID) throw new Error('Missing EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID.')

      if (!isInitialized) {
        const init = await initialize()
        if (init.error) throw init.error
      }

      if (Platform.OS === 'android') {
        const { error } = await requestNeededAndroidPermissions({
          accessFineLocation: {
            title: 'Location required',
            message: 'Stripe Terminal needs location permission to discover and connect Tap to Pay readers.',
            buttonPositive: 'Allow',
          },
        })
        if (error) throw new Error(Object.values(error).join(', '))
      }

      setStage('connecting')
      if (!connectedReader) {
        discoveredReaders.current = []
        const discovery = await discoverReaders({ discoveryMethod: 'tapToPay' })
        if (discovery.error) throw discovery.error

        const reader = discoveredReaders.current[0]
        if (!reader) throw new Error('No Tap to Pay reader was discovered on this device.')

        const connected = await connectReader({
          discoveryMethod: 'tapToPay',
          reader,
          locationId: STRIPE_TERMINAL_LOCATION_ID,
          merchantDisplayName: 'IndustryForms',
          tosAcceptancePermitted: true,
          autoReconnectOnUnexpectedDisconnect: true,
        })
        if (connected.error) throw connected.error
      }

      const paymentIntent = await fetchTerminalPaymentIntent(API_BASE, selected.id)
      const retrieved = await retrievePaymentIntent(paymentIntent.client_secret)
      if (retrieved.error) throw retrieved.error
      if (!retrieved.paymentIntent) throw new Error('Stripe did not return a PaymentIntent.')

      setStage('collecting')
      const collected = await collectPaymentMethod({
        paymentIntent: retrieved.paymentIntent,
        skipTipping: true,
        customerCancellation: 'enableIfAvailable',
      })
      if (collected.error) throw collected.error
      if (!collected.paymentIntent) throw new Error('Payment method collection did not return a PaymentIntent.')

      setStage('confirming')
      const confirmed = await confirmPaymentIntent({ paymentIntent: collected.paymentIntent })
      if (confirmed.error) throw confirmed.error

      setStage('success')
    } catch (error) {
      await cancelDiscovering().catch(() => undefined)
      setErrorMsg(messageFromError(error))
      setStage('error')
    }
  }

  function reset() {
    setStage(preselectedId ? 'confirm' : 'select')
    setErrorMsg('')
  }

  async function cancelPayment() {
    await cancelCollectPaymentMethod().catch(() => undefined)
    reset()
  }

  // ─── Success state ───────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ title: 'Tap to Pay', headerTintColor: '#f97316' }} />
        <View style={s.centred}>
          <View style={s.successCircle}>
            <Icon name="check" size={48} color="#22c55e" />
          </View>
          <Text style={s.successTitle}>Payment Received</Text>
          <Text style={s.successSub}>
            {selected ? `${selected.invoice_number} — ${fmt(selected.outstanding)}` : ''}
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.anotherBtn} onPress={() => { setSelected(null); setStage('select') }}>
            <Text style={s.anotherBtnText}>Take another payment</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ─── Error state ─────────────────────────────────────────────────
  if (stage === 'error') {
    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ title: 'Tap to Pay', headerTintColor: '#f97316' }} />
        <View style={s.centred}>
          <View style={s.errorCircle}>
            <Icon name="x" size={40} color="#ef4444" />
          </View>
          <Text style={s.errorTitle}>Payment Failed</Text>
          <Text style={s.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={reset}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ─── Processing states ───────────────────────────────────────────
  if (stage === 'connecting' || stage === 'collecting' || stage === 'confirming') {
    const label =
      stage === 'connecting' ? 'Connecting reader…' :
      stage === 'collecting' ? 'Tap card or device to pay' :
      'Confirming payment…'
    const icon: IconName =
      stage === 'connecting' ? 'wifi' :
      stage === 'collecting' ? 'credit-card' :
      'loader'

    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ title: 'Tap to Pay', headerTintColor: '#f97316' }} />
        <View style={s.centred}>
          {stage === 'collecting' ? (
            <View style={s.tapCircle}>
              <Icon name="credit-card" size={52} color="#f97316" />
            </View>
          ) : (
            <ActivityIndicator size="large" color="#f97316" style={{ marginBottom: 24 }} />
          )}
          <Text style={s.processingLabel}>{label}</Text>
          {selected && (
            <Text style={s.processingAmount}>{fmt(selected.outstanding)}</Text>
          )}
          {stage === 'collecting' && (
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={cancelPayment}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    )
  }

  // ─── Confirm state (invoice selected, show summary + Start) ──────
  if (stage === 'confirm' && selected) {
    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ title: 'Tap to Pay', headerTintColor: '#f97316' }} />
        <View style={{ flex: 1, padding: 20 }}>

          <TouchableOpacity style={s.backRow} onPress={() => setStage('select')}>
            <Icon name="chevron-left" size={18} color="#f97316" />
            <Text style={s.backText}>All invoices</Text>
          </TouchableOpacity>

          <View style={s.confirmCard}>
            <Text style={s.confirmLabel}>Amount due</Text>
            <Text style={s.confirmAmount}>{fmt(selected.outstanding)}</Text>
            {selected.amount_paid > 0 && (
              <Text style={s.confirmPartial}>
                ({fmt(selected.amount_paid)} of {fmt(selected.total)} already paid)
              </Text>
            )}
            <View style={s.confirmDivider} />
            <View style={s.confirmMeta}>
              <Text style={s.confirmMetaLabel}>Invoice</Text>
              <Text style={s.confirmMetaValue}>{selected.invoice_number}</Text>
            </View>
            {selected.customer_name && (
              <View style={s.confirmMeta}>
                <Text style={s.confirmMetaLabel}>Customer</Text>
                <Text style={s.confirmMetaValue}>{selected.customer_name}</Text>
              </View>
            )}
            {selected.job_title && (
              <View style={s.confirmMeta}>
                <Text style={s.confirmMetaLabel}>Job</Text>
                <Text style={s.confirmMetaValue}>{selected.job_title}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={s.payBtn} onPress={startPayment} activeOpacity={0.85}>
            <Icon name="credit-card" size={20} color="#fff" />
            <Text style={s.payBtnText}>Collect Payment</Text>
          </TouchableOpacity>

          <Text style={s.payHint}>Customer taps their card, phone, or watch.</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ─── Select state (invoice list) ─────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ title: 'Tap to Pay', headerTintColor: '#f97316' }} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color="#f97316" />
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
          ListHeaderComponent={
            <Text style={s.listHeader}>Select an invoice to collect payment for</Text>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="check-circle" size={40} color="#d1d5db" />
              <Text style={s.emptyText}>No outstanding invoices</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = STATUS_COLOR[item.status] ?? '#9ca3af'
            return (
              <TouchableOpacity style={s.card} onPress={() => selectInvoice(item)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={s.invNumber}>{item.invoice_number}</Text>
                  {item.customer_name && <Text style={s.invCustomer}>{item.customer_name}</Text>}
                  {item.job_title && <Text style={s.invJob} numberOfLines={1}>{item.job_title}</Text>}
                </View>
                <View style={s.cardRight}>
                  <Text style={s.invAmount}>{fmt(item.outstanding)}</Text>
                  <View style={[s.statusDot, { backgroundColor: color }]} />
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  listHeader: { fontSize: 13, color: '#6b7280', fontWeight: '500', marginBottom: 4, textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  invNumber: { fontSize: 12, color: '#6b7280', fontWeight: '600', letterSpacing: 0.4 },
  invCustomer: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  invJob: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  invAmount: { fontSize: 17, fontWeight: '800', color: '#111827' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyText: { color: '#6b7280', fontSize: 15 },

  // confirm
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  backText: { color: '#f97316', fontSize: 14, fontWeight: '600' },
  confirmCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    alignItems: 'center',
  },
  confirmLabel: { fontSize: 13, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  confirmAmount: { fontSize: 44, fontWeight: '800', color: '#111827', letterSpacing: -1 },
  confirmPartial: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  confirmDivider: { height: 1, backgroundColor: '#f3f4f6', width: '100%', marginVertical: 20 },
  confirmMeta: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 5 },
  confirmMetaLabel: { fontSize: 13, color: '#6b7280' },
  confirmMetaValue: { fontSize: 13, fontWeight: '600', color: '#374151' },
  payBtn: {
    backgroundColor: '#22c55e', borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  payBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  payHint: { textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 14 },

  // processing
  processingLabel: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
  processingAmount: { fontSize: 36, fontWeight: '800', color: '#f97316', marginBottom: 32 },
  tapCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#fff7ed', borderWidth: 3, borderColor: '#fed7aa',
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },
  cancelBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  cancelBtnText: { color: '#6b7280', fontWeight: '600', fontSize: 15 },

  // success
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  successTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8 },
  successSub: { fontSize: 15, color: '#6b7280', marginBottom: 32 },
  doneBtn: { backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 48, marginBottom: 12 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  anotherBtn: { padding: 12 },
  anotherBtnText: { color: '#f97316', fontWeight: '600', fontSize: 14 },

  // error
  errorCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  errorTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  errorMsg: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  retryBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40 },
  retryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
