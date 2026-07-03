// POST /api/messages/action
// Triage actions for the unified inbox. Owner/admin only, session-scoped (RLS).
//
// Body: { action, key, ...extra }
//   mark_read      { key }
//   mark_status    { key, status: 'open'|'pending'|'closed'|'spam' }
//   create_customer{ key, name, phone?, email? }   — sms-unmatched only
//   link_customer  { key, customerId }             — sms-unmatched only

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function parseKey(key: string): [string, string] {
  const i = key.indexOf(':')
  return i === -1 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { action, key, status, name, phone, email, customerId } = await req.json().catch(() => ({}))
  if (!action || !key) return NextResponse.json({ error: 'action and key required' }, { status: 400 })
  const [type, id] = parseKey(key)

  if (action === 'mark_read') {
    if (type === 'sms') {
      await supabase.from('customer_messages').update({ read_at: new Date().toISOString() })
        .eq('customer_id', id).eq('direction', 'inbound').is('read_at', null)
    } else if (type === 'sms-unmatched') {
      await supabase.from('customer_messages').update({ read_at: new Date().toISOString() }).eq('id', id)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_status') {
    if (!['open', 'pending', 'closed', 'spam'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (type === 'sms') {
      await supabase.from('customer_messages').update({ status }).eq('customer_id', id)
    } else if (type === 'sms-unmatched') {
      await supabase.from('customer_messages').update({ status }).eq('id', id)
    } else {
      return NextResponse.json({ error: 'Status changes for this conversation type happen on its own page' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'create_customer' || action === 'link_customer') {
    if (type !== 'sms-unmatched') return NextResponse.json({ error: 'Only unmatched SMS can be linked to a customer' }, { status: 400 })

    const { data: message } = await supabase.from('customer_messages')
      .select('id, company_id, from_number').eq('id', id).single()
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    let targetCustomerId = customerId as string | undefined
    if (action === 'create_customer') {
      if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
      const { data: created, error } = await supabase.from('customers').insert({
        company_id: message.company_id,
        name: name.trim(),
        phone: phone?.trim() || message.from_number || null,
        email: email?.trim() || null,
      }).select('id').single()
      if (error || !created) return NextResponse.json({ error: error?.message ?? 'Failed to create customer' }, { status: 500 })
      targetCustomerId = created.id
    }
    if (!targetCustomerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

    // Re-home every unmatched message from this sender (not just the one
    // that triggered the action) so the whole orphaned thread moves together.
    await supabase.from('customer_messages')
      .update({ customer_id: targetCustomerId })
      .eq('company_id', message.company_id)
      .is('customer_id', null)
      .eq('from_number', message.from_number)

    return NextResponse.json({ ok: true, customerId: targetCustomerId })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
