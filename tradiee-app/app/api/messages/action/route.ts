// POST /api/messages/action
// Triage actions for the unified inbox. Owner/admin only.
//
// Body: { action, key, ...extra }
//   mark_read      { key }
//   mark_status    { key, status: 'open'|'pending'|'closed'|'spam' }
//   create_customer{ key, name, phone?, email? }   — sms-unmatched only
//   link_customer  { key, customerId }             — sms-unmatched only
//
// Uses resolveCompanyUser (cookie or mobile Bearer token) — a bare cookie-only
// getUser() always came back unauthenticated for the mobile app, which has no
// cookie. The service client bypasses RLS, so every query below filters by
// company_id explicitly instead.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'

const bodySchema = z.object({
  action: z.enum(['mark_read', 'mark_status', 'create_customer', 'link_customer']),
  key: z.string().min(1).max(200),
  status: z.enum(['open', 'pending', 'closed', 'spam']).optional(),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal('')),
  customerId: z.string().uuid().optional(),
})

function parseKey(key: string): [string, string] {
  const i = key.indexOf(':')
  return i === -1 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)]
}

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServiceClient()

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { action, key, status, name, phone, email, customerId } = parsed.data
  const [type, id] = parseKey(key)

  if (action === 'mark_read') {
    if (type === 'sms') {
      await supabase.from('customer_messages').update({ read_at: new Date().toISOString() })
        .eq('customer_id', id).eq('company_id', auth.companyId).eq('direction', 'inbound').is('read_at', null)
    } else if (type === 'sms-unmatched') {
      await supabase.from('customer_messages').update({ read_at: new Date().toISOString() }).eq('id', id).eq('company_id', auth.companyId)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_status') {
    if (!status) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (type === 'sms') {
      await supabase.from('customer_messages').update({ status }).eq('customer_id', id).eq('company_id', auth.companyId)
    } else if (type === 'sms-unmatched') {
      await supabase.from('customer_messages').update({ status }).eq('id', id).eq('company_id', auth.companyId)
    } else {
      return NextResponse.json({ error: 'Status changes for this conversation type happen on its own page' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'create_customer' || action === 'link_customer') {
    if (type !== 'sms-unmatched') return NextResponse.json({ error: 'Only unmatched SMS can be linked to a customer' }, { status: 400 })

    // company_id filtered here too — the service client has no RLS, so
    // without this a caller could pass another company's message id and
    // create/link a customer under it.
    const { data: message } = await supabase.from('customer_messages')
      .select('id, company_id, from_number').eq('id', id).eq('company_id', auth.companyId).single()
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
    if (action === 'link_customer') {
      const { data: targetCustomer } = await supabase.from('customers').select('id').eq('id', targetCustomerId).eq('company_id', auth.companyId).maybeSingle()
      if (!targetCustomer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

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
