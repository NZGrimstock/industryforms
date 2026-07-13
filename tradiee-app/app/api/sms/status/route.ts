// Twilio Status Callback webhook — delivery receipts for outbound SMS.
// Configure in Twilio (or just rely on sendSms() passing StatusCallback on
// every send, which it already does): `${NEXT_PUBLIC_APP_URL}/api/sms/status`
// (POST, x-www-form-urlencoded). Nothing to set manually.
//
// Updates sms_usage_events.status (billing/usage ledger) and, when the
// message also has a customer_messages row (manual replies via
// /api/sms/send), customer_messages.delivery_status — best-effort, most
// outbound sends (quote/invoice/eta/reminders) only ever land in
// sms_usage_events.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validateTwilioSignature } from '@/lib/sms'

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return new NextResponse('SMS not configured', { status: 503 })

  const form = await req.formData()
  const params = Object.fromEntries(
    Array.from(form.entries()).map(([k, v]) => [k, String(v)])
  )

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/status`
  const signature = req.headers.get('x-twilio-signature') ?? ''
  if (!validateTwilioSignature(authToken, signature, url, params)) {
    return new NextResponse('Invalid signature', { status: 403 })
  }

  const sid = params.MessageSid ?? ''
  const status = params.MessageStatus ?? ''
  if (!sid || !status) return new NextResponse('Missing fields', { status: 400 })

  const service = createServiceClient()
  await service.from('sms_usage_events').update({ status }).eq('twilio_sid', sid)
  await service.from('customer_messages').update({ delivery_status: status }).eq('twilio_sid', sid)

  return new NextResponse('', { status: 200 })
}
