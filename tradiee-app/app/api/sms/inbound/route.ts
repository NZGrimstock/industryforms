// ClickSend Inbound SMS webhook.
// Configure in ClickSend: SMS → Settings → Inbound SMS Rules → action "Send to
// URL" → `${NEXT_PUBLIC_APP_URL}/api/sms/inbound?k=${CLICKSEND_INBOUND_SECRET}`
// (POST). Requires a dedicated inbound number so replies route back to us.
//
// We look up the customer by phone (E.164) and route the message to their
// thread. If no customer matches, the row still lands (customer_id null) so
// owners can see the orphan in the /messages Unmatched tab.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { toE164, clickSendWebhookAuthorized, readWebhookParams } from '@/lib/sms'
import { notifyCompanyInbox } from '@/lib/push'

export async function POST(req: Request) {
  // Dark until the shared secret is configured — refuse to process (and never
  // write a row) while unset, so no spoofed inbound can land.
  if (!process.env.CLICKSEND_INBOUND_SECRET) return new NextResponse('SMS not configured', { status: 503 })
  if (!clickSendWebhookAuthorized(req)) return new NextResponse('Invalid secret', { status: 403 })

  const params = await readWebhookParams(req)

  // ClickSend inbound fields; accept the common aliases across rule/automation
  // shapes. `original_message_id` links a reply back to the outbound message.
  const from = params.from || params.sms || ''
  const to = params.to || ''
  const body = params.body || params.message || ''
  const sid = params.message_id || params.messageid || ''
  if (!from || !body) {
    // Names only, no values — lets us confirm ClickSend's field mapping from a
    // real test inbound without logging message content (PII).
    console.warn('[sms/inbound] unexpected payload shape, keys=', Object.keys(params).join(','))
    return new NextResponse('Missing fields', { status: 400 })
  }

  const service = createServiceClient()

  // Owner number gate (single-tenant): only accept messages to our number.
  // Per-company number → company_id routing is a later multi-tenant concern.
  const ownerNumber = process.env.CLICKSEND_FROM
  if (ownerNumber && to && to !== ownerNumber) {
    return new NextResponse('Unknown destination', { status: 200 })
  }

  // Best-effort customer match: any customer whose normalised phone equals the
  // inbound sender.
  const matchPhone = toE164(from) ?? from
  const { data: customer } = await service
    .from('customers')
    .select('id, company_id')
    .or(`phone.eq.${matchPhone},phone.eq.${from}`)
    .limit(1)
    .maybeSingle()

  if (customer) {
    const { data: inserted } = await service.from('customer_messages').insert({
      company_id: customer.company_id,
      customer_id: customer.id,
      direction: 'inbound',
      body,
      twilio_sid: sid || null,
      from_number: from,
      to_number: to,
      source: 'sms',
      status: 'open',
    }).select('id').single()

    if (inserted) {
      const { data: custRow } = await service.from('customers').select('name').eq('id', customer.id).single()
      await notifyCompanyInbox(service, customer.company_id, {
        title: custRow?.name ?? 'New message',
        body,
        key: `sms:${customer.id}`,
        phone: from,
      })
    }
  } else {
    // Unmatched sender — still land the row (customer_id null) so it shows up in
    // the Unmatched tab and can be converted to a customer.
    const ownerCompanyId = process.env.TWILIO_OWNER_COMPANY_ID
    if (ownerCompanyId) {
      const { data: inserted } = await service.from('customer_messages').insert({
        company_id: ownerCompanyId,
        customer_id: null,
        direction: 'inbound',
        body,
        twilio_sid: sid || null,
        from_number: from,
        to_number: to,
        source: 'sms',
        status: 'open',
      }).select('id').single()

      if (inserted) {
        await notifyCompanyInbox(service, ownerCompanyId, {
          title: from,
          body,
          key: `sms-unmatched:${inserted.id}`,
          phone: from,
        })
      }
    }
  }

  // ClickSend just needs a 2xx to consider the webhook delivered.
  return new NextResponse('OK', { status: 200 })
}
