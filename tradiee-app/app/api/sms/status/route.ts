// ClickSend delivery-receipt (DLR) webhook — status updates for outbound SMS.
// Configure in ClickSend: Messaging → Delivery Reports → URL →
// `${NEXT_PUBLIC_APP_URL}/api/sms/status?k=${CLICKSEND_INBOUND_SECRET}` (POST).
//
// Updates sms_usage_events.status (billing/usage ledger) and, when the message
// also has a customer_messages row (manual replies via /api/sms/send),
// customer_messages.delivery_status — best-effort; most outbound sends
// (quote/invoice/eta/reminders) only ever land in sms_usage_events.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { clickSendWebhookAuthorized, readWebhookParams } from '@/lib/sms'

export async function POST(req: Request) {
  if (!process.env.CLICKSEND_INBOUND_SECRET) return new NextResponse('SMS not configured', { status: 503 })
  if (!clickSendWebhookAuthorized(req)) return new NextResponse('Invalid secret', { status: 403 })

  const params = await readWebhookParams(req)
  const sid = params.message_id || params.messageid || ''
  const status = params.status || params.status_code || ''
  if (!sid || !status) {
    console.warn('[sms/status] unexpected payload shape, keys=', Object.keys(params).join(','))
    return new NextResponse('Missing fields', { status: 400 })
  }

  const service = createServiceClient()
  await service.from('sms_usage_events').update({ status }).eq('twilio_sid', sid)
  await service.from('customer_messages').update({ delivery_status: status }).eq('twilio_sid', sid)

  return new NextResponse('OK', { status: 200 })
}
