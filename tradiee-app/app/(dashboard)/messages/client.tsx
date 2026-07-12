'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { SmsThread } from '@/components/customers/sms-thread'
import { useToast } from '@/components/ui/toast'
import { Search, UserPlus, Link2, CheckCircle2, ShieldOff } from 'lucide-react'
import type { ConversationSummary } from '@/lib/messages'
import { useTimezone } from '@/components/providers/timezone-provider'
import { formatDate, formatDateTime } from '@/lib/datetime'

type Tab = 'open' | 'unread' | 'bookings' | 'enquiries' | 'unmatched' | 'closed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'unread', label: 'Unread' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'closed', label: 'Closed' },
]

const SOURCE_LABEL: Record<ConversationSummary['source'], string> = {
  sms: 'SMS', email: 'Email', booking: 'Booking', enquiry: 'Enquiry', web_lead: 'Web lead',
}

type SmsThreadData = { type: 'sms'; customer: { id: string; name: string; phone: string | null; email: string | null } | null; messages: { id: string; direction: 'inbound' | 'outbound'; body: string; created_at: string; delivery_status: string | null }[] }
type UnmatchedThreadData = { type: 'sms-unmatched'; message: { id: string; direction: string; body: string; created_at: string; from_number: string | null; to_number: string | null } }
type EnquiryThreadData = { type: 'enquiry'; enquiry: { id: string; customer_name: string; customer_email: string | null; customer_phone: string | null; address: string | null; description: string | null; source: string; status: string; notes: string | null; follow_up_at: string | null; created_at: string } }
type ThreadData = SmsThreadData | UnmatchedThreadData | EnquiryThreadData

export function MessagesClient({ initial, twilioLive }: { initial: ConversationSummary[]; twilioLive: boolean }) {
  const { toast } = useToast()
  const timezone = useTimezone()
  const [conversations, setConversations] = useState(initial)
  const [tab, setTab] = useState<Tab>('open')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadData | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [newCust, setNewCust] = useState({ name: '', phone: '', email: '' })
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/messages/conversations')
    if (!res.ok) return
    const data = await res.json()
    setConversations(data.conversations ?? [])
  }, [])

  useEffect(() => {
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [refresh])

  const filtered = useMemo(() => {
    let list = conversations
    if (tab === 'open') list = list.filter(c => c.status === 'open')
    else if (tab === 'unread') list = list.filter(c => c.unread)
    else if (tab === 'bookings') list = list.filter(c => c.source === 'booking')
    else if (tab === 'enquiries') list = list.filter(c => c.source === 'enquiry' || c.source === 'web_lead')
    else if (tab === 'unmatched') list = list.filter(c => c.source === 'sms' && c.customerId === null)
    else if (tab === 'closed') list = list.filter(c => c.status === 'closed')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => c.displayName.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q))
    }
    return list
  }, [conversations, tab, search])

  const selected = conversations.find(c => c.key === selectedKey) ?? null

  const loadThread = useCallback(async (key: string) => {
    setThreadLoading(true)
    setThread(null)
    setNewCust({ name: '', phone: '', email: '' })
    const res = await fetch(`/api/messages/thread?key=${encodeURIComponent(key)}`)
    setThreadLoading(false)
    if (!res.ok) { toast('Could not load conversation', 'error'); return }
    const data = await res.json()
    setThread(data)
    if (data.type === 'sms-unmatched' && data.message?.from_number) {
      setNewCust(c => ({ ...c, phone: data.message.from_number }))
    }
  }, [toast])

  function select(key: string) {
    setSelectedKey(key)
    loadThread(key)
  }

  async function action(body: Record<string, unknown>) {
    const res = await fetch('/api/messages/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'Action failed' }))
      toast(error ?? 'Action failed', 'error')
      return false
    }
    return true
  }

  async function markStatus(status: string) {
    if (!selectedKey) return
    const ok = await action({ action: 'mark_status', key: selectedKey, status })
    if (ok) { toast('Updated'); refresh() }
  }

  async function createCustomerFromUnmatched() {
    if (!selectedKey || !newCust.name.trim()) return
    setCreating(true)
    const ok = await action({ action: 'create_customer', key: selectedKey, ...newCust })
    setCreating(false)
    if (ok) {
      toast('Customer created — conversation moved')
      setSelectedKey(null)
      setThread(null)
      refresh()
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation list */}
      <div className="w-80 shrink-0 border-r border-gray-100 flex flex-col bg-white">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1 p-2 border-b border-gray-100">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full ${tab === t.key ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 mt-10 px-4">Nothing here</p>
          ) : filtered.map(c => (
            <button
              key={c.key}
              onClick={() => select(c.key)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${selectedKey === c.key ? 'bg-orange-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${c.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{c.displayName}</span>
                {c.unread && <span className="w-2 h-2 rounded-full bg-[var(--accent,#f97316)] shrink-0" />}
              </div>
              <p className="text-xs text-gray-400 truncate mt-0.5">{c.preview}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-semibold uppercase text-gray-400">{SOURCE_LABEL[c.source]}</span>
                <span className="text-[10px] text-gray-300">{formatDate(c.lastActivity, timezone, { day: 'numeric', month: 'short' })}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread / detail panel */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selected ? (
          <p className="text-sm text-gray-400 text-center mt-20">Select a conversation</p>
        ) : threadLoading || !thread ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : thread.type === 'sms' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{thread.customer?.name ?? 'Unknown customer'}</h2>
              <div className="flex gap-2">
                {thread.customer && <Link href={`/customers/${thread.customer.id}`} className="text-sm text-[var(--accent,#f97316)] hover:underline">Open customer →</Link>}
                <button onClick={() => markStatus(selected.status === 'closed' ? 'open' : 'closed')} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {selected.status === 'closed' ? 'Reopen' : 'Mark closed'}
                </button>
              </div>
            </div>
            <SmsThread
              customerId={thread.customer?.id ?? ''}
              customerPhone={thread.customer?.phone ?? null}
              initial={thread.messages}
              twilioLive={twilioLive}
            />
          </div>
        ) : thread.type === 'sms-unmatched' ? (
          <div className="space-y-4 max-w-lg">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Unknown sender</h2>
              <p className="text-sm text-gray-500">{thread.message.from_number}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">{thread.message.body}</div>
            <p className="text-xs text-gray-400">{formatDateTime(thread.message.created_at, timezone, { dateStyle: 'medium', timeStyle: 'short' })}</p>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Create customer from this message</p>
              <input value={newCust.name} onChange={e => setNewCust(c => ({ ...c, name: e.target.value }))} placeholder="Name *" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-300" />
              <input value={newCust.phone} onChange={e => setNewCust(c => ({ ...c, phone: e.target.value }))} placeholder="Phone" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-300" />
              <input value={newCust.email} onChange={e => setNewCust(c => ({ ...c, email: e.target.value }))} placeholder="Email" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-300" />
              <button
                onClick={createCustomerFromUnmatched}
                disabled={!newCust.name.trim() || creating}
                className="inline-flex items-center gap-1.5 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium"
              >
                <UserPlus className="h-4 w-4" /> {creating ? 'Creating…' : 'Create customer'}
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => markStatus('spam')} className="text-xs text-gray-500 hover:text-red-500 inline-flex items-center gap-1">
                <ShieldOff className="h-3.5 w-3.5" /> Mark spam
              </button>
              <button onClick={() => markStatus('closed')} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{thread.enquiry.customer_name}</h2>
              <Link href={`/enquiries/${thread.enquiry.id}`} className="text-sm text-[var(--accent,#f97316)] hover:underline inline-flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" /> Open enquiry →
              </Link>
            </div>
            <dl className="text-sm space-y-1.5">
              {thread.enquiry.customer_email && <div className="flex gap-2"><dt className="text-gray-400 w-16 shrink-0">Email</dt><dd className="text-gray-700">{thread.enquiry.customer_email}</dd></div>}
              {thread.enquiry.customer_phone && <div className="flex gap-2"><dt className="text-gray-400 w-16 shrink-0">Phone</dt><dd className="text-gray-700">{thread.enquiry.customer_phone}</dd></div>}
              {thread.enquiry.address && <div className="flex gap-2"><dt className="text-gray-400 w-16 shrink-0">Address</dt><dd className="text-gray-700">{thread.enquiry.address}</dd></div>}
            </dl>
            {thread.enquiry.description && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">{thread.enquiry.description}</div>
            )}
            <p className="text-xs text-gray-400">Received {formatDateTime(thread.enquiry.created_at, timezone, { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        )}
      </div>
    </div>
  )
}
