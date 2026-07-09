// Thin client over the web app's unified-inbox + SMS APIs (Mobile Overhaul
// brief §7/§10 — the phone reuses these endpoints rather than duplicating
// business logic on-device).

import { supabase } from '@/lib/supabase'

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

export type ConversationSummary = {
  key: string
  source: 'sms' | 'email' | 'booking' | 'enquiry' | 'web_lead'
  customerId: string | null
  displayName: string
  preview: string
  lastActivity: string
  unread: boolean
  status: 'open' | 'pending' | 'closed' | 'spam'
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again.')
  return { Authorization: `Bearer ${session.access_token}` }
}

async function apiFetch(path: string, init?: RequestInit) {
  if (!API_BASE) throw new Error('Missing EXPO_PUBLIC_API_URL.')
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json()
}

export function getConversations(): Promise<{ conversations: ConversationSummary[]; smsEnabled: boolean }> {
  return apiFetch('/api/messages/conversations')
}

export function getThread(key: string) {
  return apiFetch(`/api/messages/thread?key=${encodeURIComponent(key)}`)
}

export function markRead(key: string) {
  return apiFetch('/api/messages/action', { method: 'POST', body: JSON.stringify({ action: 'mark_read', key }) })
}

export function markStatus(key: string, status: 'open' | 'pending' | 'closed' | 'spam') {
  return apiFetch('/api/messages/action', { method: 'POST', body: JSON.stringify({ action: 'mark_status', key, status }) })
}

export function createCustomerFromUnmatched(key: string, name: string, phone?: string, email?: string) {
  return apiFetch('/api/messages/action', { method: 'POST', body: JSON.stringify({ action: 'create_customer', key, name, phone, email }) })
}

export function sendSms(customerId: string, body: string) {
  return apiFetch('/api/sms/send', { method: 'POST', body: JSON.stringify({ customer_id: customerId, body }) })
}

export function patchBooking(id: string, action: 'confirm' | 'cancel' | 'no_show') {
  return apiFetch(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
}
