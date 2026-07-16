import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Icon, type IconName } from '@/lib/icons'
import { TAP_TO_PAY_EDUCATION_KEY } from '@/lib/tap-to-pay'

// Apple Tap to Pay review requirements 4.2/4.3/4.5/4.6/4.7/4.8: merchant
// education shown once after enabling Tap to Pay, and always available for
// reference from the More menu. `next` (if present) is where "Continue"
// should route to — the entry point that gated on TAP_TO_PAY_EDUCATION_KEY.
const TOPICS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'credit-card',
    title: 'Accepting contactless cards',
    body: 'Ask the customer to hold their contactless debit or credit card near the top of your iPhone, above the screen. Hold it there until you feel a vibration and see the confirmation.',
  },
  {
    icon: 'smartphone',
    title: 'Apple Pay & other digital wallets',
    body: 'Apple Pay, Google Pay, and other digital wallets work the same way — the customer holds their phone or watch near the top of your iPhone.',
  },
  {
    icon: 'lock',
    title: 'PIN entry',
    body: 'Transactions that require PIN entry will automatically prompt a PIN entry screen when using Tap to Pay on iPhone. Tap to Pay on iPhone is designed to prevent all photo, video, screenshot and screen-recording features from capturing a customer’s card number or PIN information.',
  },
  {
    icon: 'lock',
    title: 'PIN accessibility',
    body: 'For customers needing visual or other assistance, accessibility options are built in. Audible instructions guide the customer to draw their PIN on the screen or tap the screen to indicate each digit — tapping once for 1, twice for 2, and so on. To submit their PIN, they swipe right with two fingers.',
  },
  {
    icon: 'refresh-cw',
    title: 'If a card can’t be read',
    body: 'If Tap to Pay can’t read a card, use "Record payment" on the invoice to log the payment manually — for example if you take it by bank transfer or cash instead.',
  },
]

export default function TapToPayHelpScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>()

  async function continueOn() {
    await AsyncStorage.setItem(TAP_TO_PAY_EDUCATION_KEY, '1')
    if (next) router.replace(next as never)
    else router.back()
  }

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ title: 'Using Tap to Pay', headerTintColor: '#f97316' }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={s.heading}>Accept payments with Tap to Pay on iPhone</Text>
        <Text style={s.sub}>No extra hardware needed — just your iPhone.</Text>

        {TOPICS.map(t => (
          <View key={t.title} style={s.card}>
            <View style={s.iconWrap}>
              <Icon name={t.icon} size={20} color="#f97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{t.title}</Text>
              <Text style={s.cardBody}>{t.body}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={s.btn} onPress={continueOn} activeOpacity={0.85}>
          <Text style={s.btnText}>{next ? 'Continue' : 'Done'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  heading: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  card: {
    flexDirection: 'row', gap: 14, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardBody: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
  btn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
