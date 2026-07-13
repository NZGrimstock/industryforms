// ClickSend Inbound SMS webhook.
// Configure in ClickSend: SMS → Settings → Inbound SMS Rules → action "Send to
// URL" → `${NEXT_PUBLIC_APP_URL}/api/sms/inbound?k=${CLICKSEND_INBOUND_SECRET}`
// (POST), applied to every pool number (CLICKSEND_POOL_NZ/AU) so they all
// reach this one endpoint. Requires dedicated number(s) so replies route back.
//
// Two routing modes:
//  - Pool mode (CLICKSEND_POOL_NZ/AU set): the company is resolved from
//    sms_pool_sessions by (pool_number = to, customer_phone = from) — the
//    session created by the matching outbound send is the ONLY source of
//    truth for which tenant this belongs to. A bare cross-tenant customer-
//    phone lookup (the pre-pool approach) is unsafe once one number serves
//    many companies: two unrelated tenants can each have a customer row for
//    the same phone number, and a `.limit(1)` match would silently misroute.
//    No matching session = genuinely unattributable (a cold text to a pool
//    number with no prior outbound history) — sent a generic auto-reply
//    instead of guessing a company.
//  - Legacy single-number mode (pool unset): pre-2026-07-13 behaviour,
//    unchanged — one CLICKSEND_FROM number, customer matched by phone across
//    all companies, TWILIO_OWNER_COMPANY_ID as the unmatched-sender fallback.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { toE164, clickSendWebhookAuthorized, readWebhookParams, poolConfigured, allPoolNumbers, sendRawSms } from '@/lib/sms'
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

export async function POST(req: Request) {
  // Dark until the shared secret is configured — refuse to process (and never
  // write a row) while unset, so no spoofed inbound can land.
  if (!process.env.CLICKSEND_INBOUND_SECRET) return new NextResponse('SMS not configured', { status: 503 })
  if (!clickSendWebhookAuthorized(req)) return new NextResponse('Invalid secret', { status: 403 })

  const params = await readWebhookParams(req)

  // ClickSend inbound fields; accept the common aliases across rule/automation
  // shapes.
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
  const matchPhone = toE164(from) ?? from

  if (poolConfigured()) {
    if (!allPoolNumbers().includes(to)) return new NextResponse('Unknown destination', { status: 200 })

    const { data: session } = await service
      .from('sms_pool_sessions')
      .select('company_id')
      .eq('pool_number', to)
      .eq('customer_phone', matchPhone)
      .maybeSingle()

    if (!session) {
      // No session = no company can be attributed — a cold text, not an
      // outbound reply. Generic bounce, no customer_messages row, no company
      // notified (there isn't one to notify).
      console.warn('[sms/inbound] no pool session for this customer/number pair — sending generic auto-reply')
      await sendRawSms(to, from, 'This number is automated. Please contact the business directly via their website.')
      return new NextResponse('OK', { status: 200 })
    }

    await service.from('sms_pool_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('pool_number', to).eq('customer_phone', matchPhone)

    // Company is now known — match the customer WITHIN that company only
    // (no cross-tenant ambiguity left; the session already resolved the tenant).
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
    return new NextResponse('OK', { status: 200 })
  }

  // Legacy single-number mode — unchanged from pre-pool behaviour.
  const ownerNumber = process.env.CLICKSEND_FROM
  if (ownerNumber && to && to !== ownerNumber) {
    return new NextResponse('Unknown destination', { status: 200 })
  }

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
    const ownerCompanyId = process.env.TWILIO_OWNER_COMPANY_ID
    if (ownerCompanyId) {
      await landMessage(service, { companyId: ownerCompanyId, customerId: null, from, to, body, sid, title: from })
    }
  }

  // ClickSend just needs a 2xx to consider the webhook delivered.
  return new NextResponse('OK', { status: 200 })
}
