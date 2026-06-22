// Twilio Inbound SMS webhook.
// Configure in Twilio console: messaging service / number "A MESSAGE COMES IN"
// → `${NEXT_PUBLIC_APP_URL}/api/sms/inbound` (POST, x-www-form-urlencoded).
//
// We look up the customer by phone (E.164) and route the message to their
// thread. If no customer matches, the row still lands (customer_id null) so
// owners can see the orphan in a future "unmatched" view.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { toE164 } from '@/lib/sms'

export async function POST(req: Request) {
  const form = await req.formData()
  const from = String(form.get('From') ?? '')
  const to = String(form.get('To') ?? '')
  const body = String(form.get('Body') ?? '')
  const sid = String(form.get('MessageSid') ?? '')
  if (!from || !to || !body) return new NextResponse('Missing fields', { status: 400 })

  // TODO: verify X-Twilio-Signature when TWILIO_AUTH_TOKEN is set. Skipped for
  // dev / local tunnels; should be required before going live.

  const service = createServiceClient()

  // Find the company that owns the destination number (TWILIO_FROM_NUMBER for
  // single-tenant deployments; per-company numbers can be added later).
  const ownerNumber = process.env.TWILIO_FROM_NUMBER
  if (ownerNumber && to !== ownerNumber) {
    return new NextResponse('Unknown destination', { status: 200 })
  }

  // Best-effort customer match: any customer whose normalised phone equals
  // the inbound sender. Multi-tenant deployments will need a richer routing
  // layer (per-company Twilio number → company_id).
  const matchPhone = toE164(from) ?? from
  const { data: customer } = await service
    .from('customers')
    .select('id, company_id')
    .or(`phone.eq.${matchPhone},phone.eq.${from}`)
    .limit(1)
    .maybeSingle()

  if (!customer) return new NextResponse('No matching customer', { status: 200 })

  await service.from('customer_messages').insert({
    company_id: customer.company_id,
    customer_id: customer.id,
    direction: 'inbound',
    body,
    twilio_sid: sid || null,
    from_number: from,
    to_number: to,
  })

  // Twilio expects 200 with optional TwiML; empty body is fine.
  return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
