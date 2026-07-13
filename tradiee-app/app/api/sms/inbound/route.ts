// Twilio Inbound SMS webhook.
// Configure in Twilio console: messaging service / number "A MESSAGE COMES IN"
// → `${NEXT_PUBLIC_APP_URL}/api/sms/inbound` (POST, x-www-form-urlencoded),
// applied to every pool number (TWILIO_POOL_NZ/AU) so they all reach this
// one endpoint.
//
// Two routing modes:
//  - Pool mode (TWILIO_POOL_NZ/AU set): the company is resolved from
//    sms_pool_sessions by (pool_number = to, customer_phone = from) — the
//    session created by the matching outbound send is the ONLY source of
//    truth for which tenant this belongs to. A bare cross-tenant customer-
//    phone lookup (the pre-pool approach) is unsafe once one number serves
//    many companies: two unrelated tenants can each have a customer row for
//    the same phone number, and a `.limit(1)` match would silently misroute.
//    No matching session = genuinely unattributable (a cold text to a pool
//    number with no prior outbound history) — send a generic auto-reply
//    instead of guessing a company.
//  - Legacy single-number mode (pool unset): one TWILIO_FROM_NUMBER number,
//    customer matched by phone across all companies, TWILIO_OWNER_COMPANY_ID
//    as the unmatched-sender fallback.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { toE164, validateTwilioSignature, poolConfigured, allPoolNumbers, sendRawSms } from '@/lib/sms'
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
      return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
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
    return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }

  // Legacy single-number mode — unchanged from pre-pool behaviour.
  // Find the company that owns the destination number (TWILIO_FROM_NUMBER for
  // single-tenant deployments; per-company numbers can be added later —
  // tracked as an open decision in SPRINTS_GROWTH_ENGINE_RESCOPED.md).
  const ownerNumber = process.env.TWILIO_FROM_NUMBER
  if (ownerNumber && to !== ownerNumber) {
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
    // Unmatched sender — still land the row (customer_id null) so it shows
    // up in the Unmatched tab and can be converted to a customer.
    const ownerCompanyId = process.env.TWILIO_OWNER_COMPANY_ID
    if (ownerCompanyId) {
      await landMessage(service, { companyId: ownerCompanyId, customerId: null, from, to, body, sid, title: from })
    }
  }

  // Twilio expects 200 with optional TwiML; empty body is fine.
  return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
