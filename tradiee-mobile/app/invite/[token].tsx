import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'

type InvitationRow = {
  id: string
  token: string
  status: string
  job_title: string
  description: string | null
  project_address: string | null
  due_date: string | null
  agreed_price: number | null
  contractor_company_id: string
  subcontractor_company_id: string
  companies: { name: string } | null
}

function formatPrice(value: number): string {
  return '$' + value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()

  const [invitation, setInvitation] = useState<InvitationRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)

  useEffect(() => {
    if (!token) {
      setNotFound(true)
      setLoading(false)
      return
    }

    supabase
      .from('job_invitations')
      .select('*, companies!contractor_company_id(name)')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data || data.status !== 'pending') {
          setNotFound(true)
        } else {
          setInvitation(data as InvitationRow)
        }
        setLoading(false)
      })
  }, [token])

  async function handleAccept() {
    if (!token) return
    setAccepting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const apiUrl = process.env.EXPO_PUBLIC_API_URL
      const res = await fetch(`${apiUrl}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to accept invitation')
      }
      router.replace(`/jobs/${data.jobId}`)
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong')
    } finally {
      setAccepting(false)
    }
  }

  async function handleDecline() {
    if (!token) return
    setDeclining(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const apiUrl = process.env.EXPO_PUBLIC_API_URL
      const res = await fetch(`${apiUrl}/api/invitations/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to decline invitation')
      }
      Alert.alert('Invitation declined', 'You have declined the job invitation.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong')
    } finally {
      setDeclining(false)
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Job Invitation',
          headerTintColor: '#f97316',
        }}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : notFound ? (
        <View style={styles.centered}>
          <Text style={styles.notFoundTitle}>Invitation not found</Text>
          <Text style={styles.notFoundSub}>This invitation is no longer valid.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : invitation ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>From</Text>
            <Text style={styles.companyName}>{invitation.companies?.name ?? 'Unknown Company'}</Text>

            <View style={styles.divider} />

            <Text style={styles.jobTitle}>{invitation.job_title}</Text>

            {!!invitation.description && (
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>Description</Text>
                <Text style={styles.fieldValue}>{invitation.description}</Text>
              </View>
            )}

            {!!invitation.project_address && (
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>Location</Text>
                <Text style={styles.fieldValue}>{invitation.project_address}</Text>
              </View>
            )}

            {!!invitation.due_date && (
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>Due date</Text>
                <Text style={styles.fieldValue}>{formatDate(invitation.due_date)}</Text>
              </View>
            )}

            {invitation.agreed_price != null && (
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>Agreed price</Text>
                <Text style={[styles.fieldValue, styles.price]}>
                  {formatPrice(invitation.agreed_price)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.acceptBtn, accepting && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={accepting || declining}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptBtnText}>Accept Job</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.declineBtn, declining && styles.btnDisabled]}
              onPress={handleDecline}
              disabled={accepting || declining}
            >
              {declining ? (
                <ActivityIndicator color="#ef4444" />
              ) : (
                <Text style={styles.declineBtnText}>Decline</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  notFoundSub: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  companyName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 16,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  row: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    color: '#374151',
  },
  price: {
    fontWeight: '700',
    color: '#111827',
    fontSize: 17,
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
  acceptBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  declineBtn: {
    borderWidth: 2,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  declineBtnText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
