// POST /api/sms/send { customer_id, body }
//
// Sends an SMS to the customer via Twilio and stores the row in
// customer_messages (direction: outbound). Owner/admin only.
//
// Uses resolveCompanyUser (cookie or mobile Bearer token) — a bare cookie-only
// getUser() always came back unauthenticated for the mobile app, which has no
// cookie (this is the Inbox reply action, reached from the same screen that
// hit "Unauthorised" on mobile).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { sendSms } from '@/lib/sms'

// 1600 chars ≈ 10 concatenated SMS segments — generous headroom while
// capping cost/abuse from unbounded Twilio sends.
const bodySchema = z.object({
  customer_id: z.string().uuid(),
  body: z.string().trim().min(1).max(1600),
})

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { customer_id, body } = parsed.data

  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServiceClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone, company_id, companies(country)')
    .eq('id', customer_id)
    .single()
  if (!customer || customer.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!customer.phone) return NextResponse.json({ error: 'Customer has no phone' }, { status: 400 })

  const country = (customer.companies as unknown as { country: 'NZ' | 'AU' } | null)?.country ?? 'NZ'
  const result = await sendSms({
    to: customer.phone,
    body,
    country,
    companyId: customer.company_id,
    relatedType: 'customer_message',
    relatedId: customer.id,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })

  await supabase.from('customer_messages').insert({
    company_id: customer.company_id,
    customer_id: customer.id,
    direction: 'outbound',
    body,
    twilio_sid: result.id ?? null,
    from_number: result.from ?? null,
    to_number: customer.phone,
  })

  return NextResponse.json({ ok: true, sid: result.id })
}
