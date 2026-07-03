// Twilio Inbound SMS webhook.
// Configure in Twilio console: messaging service / number "A MESSAGE COMES IN"
// → `${NEXT_PUBLIC_APP_URL}/api/sms/inbound` (POST, x-www-form-urlencoded).
//
// We look up the customer by phone (E.164) and route the message to their
// thread. If no customer matches, the row still lands (customer_id null) so
// owners can see the orphan in the /messages Unmatched tab.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { toE164, validateTwilioSignature } from '@/lib/sms'

export async function POST(req: Request) {
  // Twilio is intentionally dark until TWILIO_AUTH_TOKEN is set — refuse to
  // process (and never write a row) while unconfigured, so no spoofed inbound
  // can land during the dark period.
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return new NextResponse('SMS not configured', { status: 503 })

  // Parse the body ONCE — reused for both signature validation and message
  // handling (re-reading a consumed request body throws).
  const form = await req.formData()
  const params = Object.fromEntries(
    Array.from(form.entries()).map(([k, v]) => [k, String(v)])
  )

  // Must exactly match the URL Twilio called (canonical app URL — a proxy
  // rewriting hosts/subdomains is the usual cause of false signature failures).
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/inbound`
  const signature = req.headers.get('x-twilio-signature') ?? ''
  if (!validateTwilioSignature(authToken, signature, url, params)) {
    return new NextResponse('Invalid signature', { status: 403 })
  }

  const from = params.From ?? ''
  const to = params.To ?? ''
  const body = params.Body ?? ''
  const sid = params.MessageSid ?? ''
  if (!from || !to || !body) return new NextResponse('Missing fields', { status: 400 })

  const service = createServiceClient()

  // Find the company that owns the destination number (TWILIO_FROM_NUMBER for
  // single-tenant deployments; per-company numbers can be added later —
  // tracked as an open decision in SPRINTS_GROWTH_ENGINE_RESCOPED.md).
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

  if (customer) {
    await service.from('customer_messages').insert({
      company_id: customer.company_id,
      customer_id: customer.id,
      direction: 'inbound',
      body,
      twilio_sid: sid || null,
      from_number: from,
      to_number: to,
      source: 'sms',
      status: 'open',
    })
  } else {
    // Unmatched sender — still land the row (customer_id null) so it shows
    // up in the Unmatched tab and can be converted to a customer.
    const ownerCompanyId = process.env.TWILIO_OWNER_COMPANY_ID
    if (ownerCompanyId) {
      await service.from('customer_messages').insert({
        company_id: ownerCompanyId,
        customer_id: null,
        direction: 'inbound',
        body,
        twilio_sid: sid || null,
        from_number: from,
        to_number: to,
        source: 'sms',
        status: 'open',
      })
    }
  }

  // Twilio expects 200 with optional TwiML; empty body is fine.
  return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
