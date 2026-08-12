// WebSMS webhook — replaces the old Twilio /api/sms/inbound + /api/sms/status
// (WebSMS posts both inbound replies and delivery reports to ONE configured
// URL, as JSON, unlike Twilio's two separate form-urlencoded endpoints).
//
// Configure in the WebSMS members area (websms.co.nz/members/api-keys.php):
//   ${NEXT_PUBLIC_APP_URL}/api/sms/webhook?secret=${WEBSMS_WEBHOOK_SECRET}
// Must be the real public production URL — WebSMS's servers can't reach a
// local/Tailscale dev address.
//
// Event shape is NOT fully documented by WebSMS publicly — this was built
// from their OpenAPI spec + query-endpoint response shapes, not a confirmed
// live payload. Verify against real logs after the first test message before
// fully trusting it: every payload is logged raw below specifically for that.
// Distinguishing the two event types: a delivery report carries a `status`/
// `statusCode` field; an inbound reply carries `body` with no status.
//
// Two routing modes, same as the old inbound route:
//  - Pool mode (WEBSMS_POOL_NZ/AU set): company resolved from
//    sms_pool_sessions by (pool_number = to, customer_phone = from) — the
//    only source of truth once one number serves many tenants. No matching
//    session = genuinely unattributable, generic auto-reply instead of
//    guessing a company.
//  - Legacy single-number mode (pool unset): WEBSMS_FROM_NUMBER, customer
//    matched by phone across all companies, WEBSMS_OWNER_COMPANY_ID as the
//    unmatched-sender fallback.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { toE164, validateWebhookSecret, poolConfigured, allPoolNumbers, sendRawSms } from '@/lib/sms'
import { notifyCompanyInbox } from '@/lib/push'

type ServiceClient = ReturnType<typeof createServiceClient>

async function landMessage(service: ServiceClient, params: {
  companyId: string; customerId: string | null; from: string; to: string; body: string; sid: string; title: string
}) {
  const { data: inserted } = await service.from('customer_messages').insert({
    company_id: params.companyId,
    customer_id: params.customerId,
    direction: 'inbound',
    body: params.body,
    twilio_sid: params.sid || null,
    from_number: params.from,
    to_number: params.to,
    source: 'sms',
    status: 'open',
  }).select('id').single()

  if (inserted) {
    await notifyCompanyInbox(service, params.companyId, {
      title: params.title,
      body: params.body,
      key: params.customerId ? `sms:${params.customerId}` : `sms-unmatched:${inserted.id}`,
      phone: params.from,
    })
  }
}

async function handleInbound(service: ServiceClient, payload: { from: string; to: string; body: string; sid: string }) {
  const { from, to, body, sid } = payload
  const matchPhone = toE164(from) ?? from

  if (poolConfigured()) {
    if (!allPoolNumbers().includes(to)) return

    const { data: session } = await service
      .from('sms_pool_sessions')
      .select('company_id')
      .eq('pool_number', to)
      .eq('customer_phone', matchPhone)
      .maybeSingle()

    if (!session) {
      console.warn('[sms/webhook] no pool session for this customer/number pair — sending generic auto-reply')
      await sendRawSms(to, from, 'This number is automated. Please contact the business directly via their website.')
      return
    }

    await service.from('sms_pool_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('pool_number', to).eq('customer_phone', matchPhone)

    const { data: customer } = await service
      .from('customers')
      .select('id, name')
      .eq('company_id', session.company_id)
      .or(`phone.eq.${matchPhone},phone.eq.${from}`)
      .limit(1)
      .maybeSingle()

    await landMessage(service, {
      companyId: session.company_id,
      customerId: customer?.id ?? null,
      from, to, body, sid,
      title: customer?.name ?? from,
    })
    return
  }

  // Legacy single-number mode.
  const ownerNumber = process.env.WEBSMS_FROM_NUMBER
  if (ownerNumber && to !== ownerNumber) return

  const { data: customer } = await service
    .from('customers')
    .select('id, company_id, name')
    .or(`phone.eq.${matchPhone},phone.eq.${from}`)
    .limit(1)
    .maybeSingle()

  if (customer) {
    await landMessage(service, {
      companyId: customer.company_id, customerId: customer.id, from, to, body, sid,
      title: customer.name ?? 'New message',
    })
  } else {
    const ownerCompanyId = process.env.WEBSMS_OWNER_COMPANY_ID
    if (ownerCompanyId) {
      await landMessage(service, { companyId: ownerCompanyId, customerId: null, from, to, body, sid, title: from })
    }
  }
}

async function handleDeliveryReport(service: ServiceClient, params: { sid: string; status: string }) {
  await service.from('sms_usage_events').update({ status: params.status }).eq('twilio_sid', params.sid)
  await service.from('customer_messages').update({ delivery_status: params.status }).eq('twilio_sid', params.sid)
}

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (!validateWebhookSecret(secret)) {
    return new NextResponse('Invalid signature', { status: 403 })
  }

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!payload) return new NextResponse('Invalid body', { status: 400 })

  // Logged raw and unconditionally — this is the confirmation source for the
  // exact field names WebSMS actually sends. Trim once verified against a
  // real test message; see file header.
  console.log('[sms/webhook] raw payload', JSON.stringify(payload))

  const service = createServiceClient()

  const status = (payload.status ?? payload.statusCode) as string | number | undefined
  if (status !== undefined) {
    const sid = String(payload.messageId ?? payload.message_id ?? payload.customerMessageId ?? '')
    if (!sid) return new NextResponse('Missing message id', { status: 400 })
    await handleDeliveryReport(service, { sid, status: String(status) })
    return new NextResponse('', { status: 200 })
  }

  const from = String(payload.from ?? '')
  const to = String(payload.to ?? '')
  const body = String(payload.body ?? '')
  const sid = String(payload.messageId ?? payload.message_id ?? '')
  if (!from || !to || !body) return new NextResponse('Missing fields', { status: 400 })

  await handleInbound(service, { from, to, body, sid })
  return new NextResponse('', { status: 200 })
}
