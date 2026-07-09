// Shared unified-inbox feed logic — used by the /messages server page (initial
// SSR fetch) and /api/messages/conversations (15s poll), so both render from
// identical merge/normalize logic.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

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

export async function getConversations(supabase: SupabaseClient): Promise<ConversationSummary[]> {
  const [messagesRes, enquiriesRes, bookingsRes] = await Promise.all([
    supabase
      .from('customer_messages')
      .select('id, customer_id, direction, body, created_at, read_at, status, from_number, customers(name)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('enquiries')
      .select('id, customer_name, customer_email, customer_phone, description, source, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    // Bookable-packages bookings (Sprint C/D) — distinct from the legacy
    // enquiries(source='booking') rows created by the simple booking form.
    supabase
      .from('bookings')
      .select('id, customer_name, customer_email, customer_phone, notes, status, starts_at, created_at, bookable_packages(name)')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const conversations: ConversationSummary[] = []

  const byCustomer = new Map<string, NonNullable<typeof messagesRes.data>>()
  for (const m of messagesRes.data ?? []) {
    if (!m.customer_id) {
      const cust = Array.isArray(m.customers) ? m.customers[0] : m.customers
      conversations.push({
        key: `sms-unmatched:${m.id}`,
        source: 'sms',
        customerId: null,
        displayName: (cust as { name: string } | null)?.name ?? m.from_number ?? 'Unknown sender',
        preview: m.body,
        lastActivity: m.created_at,
        unread: m.direction === 'inbound' && !m.read_at,
        status: (m.status ?? 'open') as ConversationSummary['status'],
      })
      continue
    }
    const existing = byCustomer.get(m.customer_id) ?? []
    existing.push(m)
    byCustomer.set(m.customer_id, existing)
  }
  for (const [customerId, rows] of byCustomer) {
    if (!rows || rows.length === 0) continue
    const latest = rows[0] // already ordered desc
    const cust = Array.isArray(latest.customers) ? latest.customers[0] : latest.customers
    conversations.push({
      key: `sms:${customerId}`,
      source: 'sms',
      customerId,
      displayName: (cust as { name: string } | null)?.name ?? 'Unknown customer',
      preview: latest.body,
      lastActivity: latest.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unread: rows.some((r: any) => r.direction === 'inbound' && !r.read_at),
      status: (latest.status ?? 'open') as ConversationSummary['status'],
    })
  }

  for (const e of enquiriesRes.data ?? []) {
    conversations.push({
      key: `enquiry:${e.id}`,
      source: e.source === 'website' ? 'web_lead' : e.source === 'booking' ? 'booking' : 'enquiry',
      customerId: null,
      displayName: e.customer_name,
      preview: e.description ?? e.customer_email ?? e.customer_phone ?? '',
      lastActivity: e.created_at,
      unread: e.status === 'new',
      status: e.status === 'won' || e.status === 'lost' ? 'closed' : 'open',
    })
  }

  const BOOKING_CLOSED = new Set(['cancelled', 'no_show', 'completed'])
  for (const b of bookingsRes.data ?? []) {
    const pkg = Array.isArray(b.bookable_packages) ? b.bookable_packages[0] : b.bookable_packages
    const pkgName = (pkg as { name: string } | null)?.name
    conversations.push({
      key: `booking:${b.id}`,
      source: 'booking',
      customerId: null,
      displayName: b.customer_name,
      preview: pkgName ? `${pkgName} — ${new Date(b.starts_at).toLocaleDateString('en-NZ')}` : (b.notes ?? ''),
      lastActivity: b.created_at,
      unread: b.status === 'requested',
      status: BOOKING_CLOSED.has(b.status) ? 'closed' : 'open',
    })
  }

  conversations.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
  return conversations
}
