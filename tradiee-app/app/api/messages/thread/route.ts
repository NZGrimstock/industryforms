// GET /api/messages/thread?key=sms:<customerId> | sms-unmatched:<msgId> | enquiry:<id>
//
// Returns full detail for a single conversation from the unified feed.
// Owner/admin only.
//
// Uses resolveCompanyUser (cookie or mobile Bearer token) — a bare cookie-only
// getUser() always came back unauthenticated for the mobile app, which has no
// cookie. The service client bypasses RLS, so every query below filters by
// company_id explicitly instead.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServiceClient()

  const key = req.nextUrl.searchParams.get('key') ?? ''
  const [type, id] = key.includes(':') ? [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)] : [key, '']
  if (!id) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })

  if (type === 'sms') {
    const [{ data: messages }, { data: customer }] = await Promise.all([
      supabase.from('customer_messages').select('id, direction, body, created_at, read_at, status, delivery_status')
        .eq('customer_id', id).eq('company_id', auth.companyId).order('created_at', { ascending: true }),
      supabase.from('customers').select('id, name, phone, email').eq('id', id).eq('company_id', auth.companyId).single(),
    ])
    return NextResponse.json({ type: 'sms', customer, messages: messages ?? [] })
  }

  if (type === 'sms-unmatched') {
    const { data: message } = await supabase.from('customer_messages')
      .select('id, direction, body, created_at, read_at, status, from_number, to_number')
      .eq('id', id).eq('company_id', auth.companyId).single()
    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'sms-unmatched', message })
  }

  if (type === 'enquiry') {
    const { data: enquiry } = await supabase.from('enquiries')
      .select('id, customer_name, customer_email, customer_phone, address, description, source, status, notes, follow_up_at, created_at')
      .eq('id', id).eq('company_id', auth.companyId).single()
    if (!enquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'enquiry', enquiry })
  }

  if (type === 'booking') {
    const { data: booking } = await supabase.from('bookings')
      .select(`id, customer_name, customer_email, customer_phone, site_address, notes, status, starts_at, ends_at,
                deposit_required, deposit_paid, deposit_refunded, job_id, bookable_packages(name)`)
      .eq('id', id).eq('company_id', auth.companyId).single()
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ type: 'booking', booking })
  }

  return NextResponse.json({ error: 'Unknown conversation type' }, { status: 400 })
}
