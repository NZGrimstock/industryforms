// GET /api/messages/thread?key=sms:<customerId> | sms-unmatched:<msgId> | enquiry:<id>
//
// Returns full detail for a single conversation from the unified feed.
// Owner/admin only, session-scoped (RLS).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const key = req.nextUrl.searchParams.get('key') ?? ''
  const [type, id] = key.includes(':') ? [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)] : [key, '']
  if (!id) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  if (type === 'sms') {
    const [{ data: messages }, { data: customer }] = await Promise.all([
      supabase.from('customer_messages').select('id, direction, body, created_at, read_at, status')
        .eq('customer_id', id).order('created_at', { ascending: true }),
      supabase.from('customers').select('id, name, phone, email').eq('id', id).single(),
    ])
    return NextResponse.json({ type: 'sms', customer, messages: messages ?? [] })
  }

  if (type === 'sms-unmatched') {
    const { data: message } = await supabase.from('customer_messages')
      .select('id, direction, body, created_at, read_at, status, from_number, to_number')
      .eq('id', id).single()
    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'sms-unmatched', message })
  }

  if (type === 'enquiry') {
    const { data: enquiry } = await supabase.from('enquiries')
      .select('id, customer_name, customer_email, customer_phone, address, description, source, status, notes, follow_up_at, created_at')
      .eq('id', id).single()
    if (!enquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'enquiry', enquiry })
  }

  return NextResponse.json({ error: 'Unknown conversation type' }, { status: 400 })
}
