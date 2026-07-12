import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon, type IconName } from '@/lib/icons'
import { supabase } from '@/lib/supabase'
import { getThread, markRead, markStatus, createCustomerFromUnmatched, sendSms, patchBooking } from '@/lib/notify'
import { colors, radius, shadow } from '@/lib/theme'
import { success as hapticSuccess } from '@/lib/haptics'

type SmsMessage = { id: string; direction: 'inbound' | 'outbound'; body: string; created_at: string }
type SmsThread = { type: 'sms'; customer: { id: string; name: string; phone: string | null; email: string | null } | null; messages: SmsMessage[] }
type UnmatchedThread = { type: 'sms-unmatched'; message: { id: string; body: string; created_at: string; from_number: string; to_number: string } }
type EnquiryThread = { type: 'enquiry'; enquiry: {
  id: string; customer_name: string; customer_email: string | null; customer_phone: string | null
  address: string | null; description: string | null; source: string | null; status: string; notes: string | null; created_at: string
} }
type BookingThread = { type: 'booking'; booking: {
  id: string; customer_name: string; customer_email: string | null; customer_phone: string | null
  site_address: string | null; notes: string | null; status: string; starts_at: string; ends_at: string
  deposit_required: number; deposit_paid: number; deposit_refunded: number; job_id: string | null
  bookable_packages: { name: string } | { name: string }[] | null
} }
type Thread = SmsThread | UnmatchedThread | EnquiryThread | BookingThread

const QUICK_REPLIES = ['On it — I’ll be back to you within the hour', 'Can I give you a call now?', 'Yep, that works for me']

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })
}

export default function ThreadScreen() {
  const { key, smsEnabled } = useLocalSearchParams<{ key: string; smsEnabled?: string }>()
  const decodedKey = decodeURIComponent(key ?? '')
  const dark = smsEnabled !== '1'

  const [thread, setThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await getThread(decodedKey)
      setThread(data as Thread)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load')
    }
  }, [decodedKey])

  useEffect(() => {
    load().finally(() => setLoading(false))
    markRead(decodedKey).catch(() => {})
  }, [load, decodedKey])

  async function send(body: string) {
    if (!body.trim() || thread?.type !== 'sms' || !thread.customer) return
    setSending(true)
    try {
      await sendSms(thread.customer.id, body.trim())
      hapticSuccess()
      setReply('')
      await load()
    } catch (e) {
      Alert.alert('Failed to send', e instanceof Error ? e.message : 'Unknown error')
    }
    setSending(false)
  }

  async function close() {
    await markStatus(decodedKey, 'closed').catch(() => {})
    router.back()
  }

  async function linkAsCustomer() {
    if (!newName.trim() || thread?.type !== 'sms-unmatched') return
    setSending(true)
    try {
      const res = await createCustomerFromUnmatched(decodedKey, newName.trim(), thread.message.from_number)
      hapticSuccess()
      router.replace(`/messages/${encodeURIComponent(`sms:${res.customerId}`)}`)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create customer')
    }
    setSending(false)
  }

  async function setEnquiryStatus(status: string) {
    if (thread?.type !== 'enquiry') return
    await supabase.from('enquiries').update({ status }).eq('id', thread.enquiry.id)
    setThread({ ...thread, enquiry: { ...thread.enquiry, status } })
  }

  function convertToQuote() {
    if (thread?.type !== 'enquiry') return
    const e = thread.enquiry
    router.push({
      pathname: '/quotes/new',
      params: { name: e.customer_name, email: e.customer_email ?? '', phone: e.customer_phone ?? '', address: e.address ?? '', notes: e.description ?? '' },
    })
  }

  async function bookingAction(action: 'confirm' | 'cancel' | 'no_show') {
    if (thread?.type !== 'booking') return
    setSending(true)
    try {
      await patchBooking(thread.booking.id, action)
      hapticSuccess()
      await load()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update booking')
    }
    setSending(false)
  }

  function convertToJob() {
    if (thread?.type !== 'enquiry') return
    const e = thread.enquiry
    router.push({
      pathname: '/jobs/new',
      params: { name: e.customer_name, email: e.customer_email ?? '', phone: e.customer_phone ?? '', address: e.address ?? '', notes: e.description ?? '' },
    })
  }

  if (loading) {
    return <SafeAreaView style={s.container}><ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} /></SafeAreaView>
  }
  if (!thread) {
    return <SafeAreaView style={s.container}><Text style={s.emptyText}>Not found</Text></SafeAreaView>
  }

  if (thread.type === 'enquiry') {
    const e = thread.enquiry
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <Stack.Screen options={{ title: e.customer_name, headerTintColor: colors.brand, headerShown: true }} />
        <View style={{ padding: 16, gap: 12 }}>
          {e.address && <Row icon="map-pin" text={e.address} />}
          {e.description && <Row icon="tool" text={e.description} />}
          {(e.customer_phone || e.customer_email) && (
            <Row icon="phone" text={[e.customer_phone, e.customer_email].filter(Boolean).join(' · ')} />
          )}
          <Text style={s.metaText}>{e.source ?? 'Direct'} · {new Date(e.created_at).toLocaleDateString('en-NZ')}</Text>

          <View style={s.chips}>
            {e.customer_phone && (
              <TouchableOpacity style={s.chip} onPress={() => Linking.openURL(`tel:${e.customer_phone!.replace(/[^+\d]/g, '')}`)}>
                <Text style={s.chipText}>{'\u{1F4DE}'} Call now</Text>
              </TouchableOpacity>
            )}
            {e.status === 'new' && (
              <TouchableOpacity style={s.chip} onPress={() => setEnquiryStatus('contacted')}>
                <Text style={s.chipText}>{'\u{1F44D}'} Mark contacted</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.abar}>
            <TouchableOpacity style={s.btnGhost} onPress={convertToQuote}>
              <Text style={s.btnGhostText}>{'＄'} Quote</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnGreen} onPress={convertToJob}>
              <Text style={s.btnGreenText}>{'✓'} Convert to job</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.hint}>Convert carries this enquiry's details across.</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (thread.type === 'booking') {
    const b = thread.booking
    const pkg = Array.isArray(b.bookable_packages) ? b.bookable_packages[0] : b.bookable_packages
    const canConfirm = b.status === 'requested' || b.status === 'deposit_pending'
    const canCancel = !['cancelled', 'no_show', 'completed'].includes(b.status)
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <Stack.Screen options={{ title: b.customer_name, headerTintColor: colors.brand, headerShown: true }} />
        <View style={{ padding: 16, gap: 12 }}>
          {pkg?.name && <Row icon="package" text={pkg.name} />}
          <Row icon="calendar" text={`${new Date(b.starts_at).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })} – ${new Date(b.ends_at).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}`} />
          {b.site_address && <Row icon="map-pin" text={b.site_address} />}
          {(b.customer_phone || b.customer_email) && (
            <Row icon="phone" text={[b.customer_phone, b.customer_email].filter(Boolean).join(' · ')} />
          )}
          {b.notes && <Row icon="file-text" text={b.notes} />}
          {b.deposit_required > 0 && (
            <Text style={s.metaText}>Deposit: ${b.deposit_paid.toFixed(2)} paid of ${b.deposit_required.toFixed(2)}{b.deposit_refunded > 0 && ` · $${b.deposit_refunded.toFixed(2)} refunded`}</Text>
          )}
          <Text style={s.metaText}>Status: {b.status.replace('_', ' ')}</Text>

          <View style={s.chips}>
            {b.customer_phone && (
              <TouchableOpacity style={s.chip} onPress={() => Linking.openURL(`tel:${b.customer_phone!.replace(/[^+\d]/g, '')}`)}>
                <Text style={s.chipText}>{'\u{1F4DE}'} Call now</Text>
              </TouchableOpacity>
            )}
            {b.job_id && (
              <TouchableOpacity style={s.chip} onPress={() => router.push(`/jobs/${b.job_id}`)}>
                <Text style={s.chipText}>{'\u{1F9F0}'} View job</Text>
              </TouchableOpacity>
            )}
          </View>

          {(canConfirm || canCancel) && (
            <View style={s.abar}>
              {canConfirm && (
                <TouchableOpacity style={s.btnGreen} disabled={sending} onPress={() => bookingAction('confirm')}>
                  <Text style={s.btnGreenText}>{'✓'} Confirm</Text>
                </TouchableOpacity>
              )}
              {canCancel && (
                <TouchableOpacity style={s.btnGhost} disabled={sending} onPress={() => bookingAction('cancel')}>
                  <Text style={s.btnGhostText}>Cancel booking</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    )
  }

  if (thread.type === 'sms-unmatched') {
    const m = thread.message
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <Stack.Screen options={{ title: m.from_number, headerTintColor: colors.brand, headerShown: true }} />
        <View style={{ padding: 16, gap: 14 }}>
          <View style={s.bubbleThem}><Text>{m.body}</Text><Text style={s.bubbleTime}>{fmtTime(m.created_at)}</Text></View>
          <Text style={s.hint}>Unknown sender — link this to an existing or new customer to reply.</Text>
          <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="Customer name" placeholderTextColor={colors.mut} />
          <TouchableOpacity style={[s.btnPrimaryBlock, (!newName.trim() || sending) && { opacity: 0.5 }]} disabled={!newName.trim() || sending} onPress={linkAsCustomer}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>Create customer & reply</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // sms
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={s.container} edges={['bottom']}>
        <Stack.Screen options={{
          title: thread.customer?.name ?? 'Thread',
          headerTintColor: colors.brand,
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel="Close conversation">
              <Icon name="check-circle" size={20} color={colors.brand} />
            </TouchableOpacity>
          ),
        }} />
        <FlatList
          data={thread.messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <View style={item.direction === 'inbound' ? s.bubbleThem : s.bubbleMe}>
              <Text style={item.direction === 'outbound' ? { color: '#fff' } : undefined}>{item.body}</Text>
              <Text style={[s.bubbleTime, item.direction === 'outbound' && { color: 'rgba(255,255,255,0.75)' }]}>{fmtTime(item.created_at)}</Text>
            </View>
          )}
        />

        {dark ? (
          <View style={s.darkbox}>
            <Text style={s.lock}>{'\u{1F512}'}</Text>
            <Text style={s.darkboxText}>SMS not enabled. Configure Twilio in Settings → Integrations to reply here.</Text>
          </View>
        ) : (
          <>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={QUICK_REPLIES}
              keyExtractor={q => q}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.chip} onPress={() => send(item)} disabled={sending}>
                  <Text style={s.chipText} numberOfLines={1}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <View style={s.replyBar}>
              <TextInput
                style={s.replyInput}
                value={reply}
                onChangeText={setReply}
                placeholder="Write a reply…"
                placeholderTextColor={colors.mut}
                multiline
              />
              <TouchableOpacity
                style={[s.sendBtn, (!reply.trim() || sending) && { opacity: 0.5 }]}
                disabled={!reply.trim() || sending}
                onPress={() => send(reply)}
                accessibilityRole="button"
                accessibilityLabel="Send reply"
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Icon name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

function Row({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={s.row}>
      <Icon name={icon} size={16} color={colors.mut} style={{ width: 20 }} />
      <Text style={s.rowText}>{text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  emptyText: { color: colors.mut, fontSize: 15, textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rowText: { flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 },
  metaText: { fontSize: 11, color: colors.mut },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  chip: { backgroundColor: colors.brandBg, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: 22, paddingHorizontal: 13, paddingVertical: 9, maxWidth: 260 },
  chipText: { color: colors.brandDark, fontWeight: '600', fontSize: 12.5 },
  abar: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnGhost: { flex: 1, backgroundColor: colors.brandBg, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: 13, padding: 13, alignItems: 'center' },
  btnGhostText: { color: colors.brand, fontWeight: '800' },
  btnGreen: { flex: 1, backgroundColor: colors.success, borderRadius: 13, padding: 13, alignItems: 'center' },
  btnGreenText: { color: '#fff', fontWeight: '800' },
  hint: { textAlign: 'center', color: colors.mut, fontSize: 11, marginTop: 4 },
  bubbleThem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, borderBottomLeftRadius: 5, padding: 12, maxWidth: '78%', alignSelf: 'flex-start' },
  bubbleMe: { backgroundColor: colors.brand, borderRadius: 16, borderBottomRightRadius: 5, padding: 12, maxWidth: '78%', alignSelf: 'flex-end' },
  bubbleTime: { fontSize: 10, opacity: 0.7, marginTop: 4 },
  darkbox: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db', borderStyle: 'dashed', borderRadius: radius.md, padding: 12, margin: 12 },
  lock: { fontSize: 18 },
  darkboxText: { flex: 1, fontSize: 12, color: colors.sub, lineHeight: 17 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: colors.ink },
  btnPrimaryBlock: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: 15, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  replyBar: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  replyInput: { flex: 1, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.ink, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...shadow.card },
})
