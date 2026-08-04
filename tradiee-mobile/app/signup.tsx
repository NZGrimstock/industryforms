import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView, Linking,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

export default function SignupScreen() {
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', companyName: '', tradeType: '', country: 'NZ',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSignup() {
    const { fullName, email, phone, password, companyName } = form
    if (!fullName || !email || !phone.trim() || !password || !companyName) {
      Alert.alert('Missing fields', 'Please fill in your name, email, phone, password and business name.')
      return
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.')
      return
    }
    if (!agreed) {
      Alert.alert('Accept the terms', 'Please accept the Terms of Service to continue.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // acceptedTerms is required by the API — signup 400s without it.
        body: JSON.stringify({ ...form, acceptedTerms: agreed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Signup failed')

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      router.replace('/(tabs)/jobs')
    } catch (err: unknown) {
      Alert.alert('Sign up failed', err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}><Text style={styles.logoText}>IF</Text></View>
            <Text style={styles.logoName}>IndustryForms</Text>
          </View>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Free 28-day trial, no credit card required.</Text>

          <Text style={styles.label}>Your name</Text>
          <TextInput style={styles.input} value={form.fullName} onChangeText={v => set('fullName', v)}
            placeholder="Full name" placeholderTextColor="#6b7280" autoCapitalize="words" />

          <Text style={styles.label}>Work email</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={v => set('email', v)}
            placeholder="email@company.com" placeholderTextColor="#6b7280"
            autoCapitalize="none" keyboardType="email-address" autoComplete="email" />

          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.input} value={form.phone} onChangeText={v => set('phone', v)}
            placeholder="+64 21 123 4567" placeholderTextColor="#6b7280"
            keyboardType="phone-pad" autoComplete="tel" />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput style={styles.passwordInput} value={form.password} onChangeText={v => set('password', v)}
              placeholder="Min. 8 characters" placeholderTextColor="#6b7280"
              secureTextEntry={!showPassword} autoComplete="new-password" />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Business name</Text>
          <TextInput style={styles.input} value={form.companyName} onChangeText={v => set('companyName', v)}
            placeholder="Your company name" placeholderTextColor="#6b7280" />

          <Text style={styles.label}>Trade type</Text>
          <TextInput style={styles.input} value={form.tradeType} onChangeText={v => set('tradeType', v)}
            placeholder="e.g. Electrician, Plumber, Builder" placeholderTextColor="#6b7280" />

          <Text style={styles.label}>Country</Text>
          <View style={styles.countryRow}>
            {['NZ', 'AU'].map(c => (
              <TouchableOpacity key={c} style={[styles.countryBtn, form.country === c && styles.countryBtnActive]}
                onPress={() => set('country', c)}>
                <Text style={[styles.countryBtnText, form.country === c && styles.countryBtnTextActive]}>
                  {c === 'NZ' ? '🇳🇿 New Zealand' : '🇦🇺 Australia'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAgreed(v => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL(`${API_URL}/terms`)}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL(`${API_URL}/privacy`)}>Privacy Policy</Text>.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, (loading || !agreed) && { opacity: 0.5 }]} onPress={handleSignup} disabled={loading || !agreed}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/login')} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>Already have an account? <Text style={styles.loginLinkBold}>Sign in</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 28, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  logoBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  logoName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827', marginBottom: 14, backgroundColor: '#f9fafb' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#f9fafb', marginBottom: 14 },
  passwordInput: { flex: 1, padding: 14, fontSize: 15, color: '#111827' },
  eyeBtn: { paddingHorizontal: 14, justifyContent: 'center' },
  eyeText: { fontSize: 18 },
  countryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  countryBtn: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, alignItems: 'center' },
  countryBtnActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  countryBtnText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  countryBtnTextActive: { color: '#f97316', fontWeight: '700' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: '#f97316', borderColor: '#f97316' },
  checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  termsText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#6b7280' },
  termsLink: { color: '#f97316', fontWeight: '600', textDecorationLine: 'underline' },
  button: { backgroundColor: '#f97316', borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  loginLink: { alignItems: 'center' },
  loginLinkText: { fontSize: 14, color: '#6b7280' },
  loginLinkBold: { color: '#f97316', fontWeight: '600' },
})
