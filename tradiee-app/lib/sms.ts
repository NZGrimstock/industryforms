// SMS via ClickSend. Mirrors lib/email.ts: a guarded sender that no-ops
// (without throwing) when not configured, so builds/runtime never depend on SMS
// being set up. Swapped from Twilio 2026-07-13 — ClickSend is materially
// cheaper for NZ/AU. The `sms_usage_events.twilio_sid` column is kept as-is: it
// now holds the ClickSend message_id. Every reader treats it as an opaque
// provider message id, so renaming the column would be a pointless migration.
import { randomUUID, timingSafeEqual } from 'crypto'
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'

const CLICKSEND_USERNAME = process.env.CLICKSEND_USERNAME
const CLICKSEND_API_KEY = process.env.CLICKSEND_API_KEY
// Dedicated number / sender ID. Required as the `from` for two-way replies to
// route back to us; if unset ClickSend uses a shared number (outbound only).
const CLICKSEND_FROM = process.env.CLICKSEND_FROM
const SMS_BILLING_DISABLED = 'SMS billing is not enabled for this account'

// Shared number pool (2026-07-13): a handful of dedicated numbers serve ALL
// tenants, routed by sms_pool_sessions rather than one number per company.
// Numbers themselves are env config (bought a few times a year, not runtime
// state); comma-separated E.164, e.g. "+64211110001,+64211110002,+64211110003".
// Falls back to the single CLICKSEND_FROM number (pre-pool behaviour) when
// unset — keeps dev/small-scale environments working without real pool
// numbers provisioned.
function poolNumbers(country: 'NZ' | 'AU'): string[] {
  const raw = country === 'AU' ? process.env.CLICKSEND_POOL_AU : process.env.CLICKSEND_POOL_NZ
  return (raw ?? '').split(',').map(n => n.trim()).filter(Boolean)
}

export function poolConfigured(): boolean {
  return poolNumbers('NZ').length > 0 || poolNumbers('AU').length > 0
}

// Every pool number across every country — used by the inbound webhook to
// recognise "this destination is one of ours" regardless of which country's
// bucket it came from.
export function allPoolNumbers(): string[] {
  return [...poolNumbers('NZ'), ...poolNumbers('AU')]
}

export function smsConfigured(): boolean {
  return !!(CLICKSEND_USERNAME && CLICKSEND_API_KEY)
}

export function isSmsBillingDisabledError(error: string | null | undefined): boolean {
  return error === SMS_BILLING_DISABLED
}

// ClickSend does NOT sign inbound/DLR webhooks (unlike Twilio's HMAC), so we
// gate them with a shared secret carried in the URL (?k=…), compared in
// constant time. Set the same secret on the ClickSend inbound rule + delivery-
// report URLs. Returns false (→ caller 503s) when the secret isn't configured,
// so nothing spoofed can land during the dark period.
export function clickSendWebhookAuthorized(req: Request): boolean {
  const secret = process.env.CLICKSEND_INBOUND_SECRET
  if (!secret) return false
  const provided = new URL(req.url).searchParams.get('k') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ClickSend webhooks arrive as form-encoded or JSON depending on the rule's
// configured method — read both into a flat string map.
export async function readWebhookParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const json = await req.json().catch(() => ({})) as Record<string, unknown>
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v ?? '')]))
  }
  const form = await req.formData().catch(() => null)
  if (!form) return {}
  return Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]))
}

/**
 * Normalise a local NZ/AU number to E.164 (Twilio requires it).
 * Leaves already-international (+…) numbers untouched.
 */
export function toE164(raw: string | null | undefined, country: 'NZ' | 'AU' = 'NZ'): string | null {
  if (!raw) return null
  const n = raw.replace(/[^\d+]/g, '')
  if (!n) return null
  if (n.startsWith('+')) return n
  const cc = country === 'AU' ? '61' : '64'
  if (n.startsWith('00')) return '+' + n.slice(2)
  if (n.startsWith(cc)) return '+' + n
  if (n.startsWith('0')) return '+' + cc + n.slice(1)
  return '+' + cc + n
}

// Sticky pool-number assignment for a (company, customer) pair. No fixed
// expiry (see migration comment) — reused forever once created, touched here
// on every send so last_activity_at stays meaningful for observability.
async function resolveOutboundFrom(companyId: string | null | undefined, dest: string, country: 'NZ' | 'AU'): Promise<string | undefined> {
  const candidates = poolNumbers(country)
  if (candidates.length === 0) return CLICKSEND_FROM || undefined
  if (!companyId) return candidates[0]

  const service = createServiceClient()

  const { data: existing } = await service
    .from('sms_pool_sessions')
    .select('pool_number')
    .eq('company_id', companyId)
    .eq('customer_phone', dest)
    .maybeSingle()
  if (existing) {
    await service.from('sms_pool_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('customer_phone', dest)
    return existing.pool_number
  }

  // First contact with this customer for this company — find a pool number
  // not already assigned to this exact customer phone by a DIFFERENT company
  // (the actual collision this table exists to prevent).
  const { data: taken } = await service
    .from('sms_pool_sessions')
    .select('pool_number')
    .eq('customer_phone', dest)
    .in('pool_number', candidates)
  const takenSet = new Set((taken ?? []).map(r => r.pool_number))
  const free = candidates.filter(n => !takenSet.has(n))

  // ponytail: if every pool number for this country is already tied to this
  // exact customer phone by other tenants — i.e. 3+ unrelated companies all
  // texting the same person concurrently — just reuse the first number.
  // Astronomically rare (would need one person to be a live SMS conversation
  // with 3+ competing trades businesses on the platform at once); accepting
  // the theoretical collision here beats failing to send at all.
  const chosen = free.length > 0 ? free[Math.floor(Math.random() * free.length)] : candidates[0]

  const { error } = await service.from('sms_pool_sessions').insert({
    company_id: companyId, customer_phone: dest, pool_number: chosen,
  })
  // A concurrent send racing us to the same (company, customer) pair is fine
  // — unique-violation just means the other request already created it.
  if (error && error.code !== '23505') {
    console.error('[sms] pool session insert failed', error)
  }
  return chosen
}

export async function sendSms(
  { to, body, country = 'NZ', companyId, relatedType, relatedId }: {
    to: string | null | undefined
    body: string
    country?: 'NZ' | 'AU'
    companyId?: string | null
    relatedType?: string
    relatedId?: string | null
  }
): Promise<{ id?: string; error?: string; from?: string }> {
  if (!smsConfigured()) {
    console.warn('ClickSend not configured — SMS not sent')
    return { error: 'SMS service not configured' }
  }
  const dest = toE164(to, country)
  if (!dest) return { error: 'No valid phone number' }

  let billing: { billable: boolean; stripeCustomerId: string | null } = { billable: false, stripeCustomerId: null }
  if (companyId) {
    const check = await resolveSmsBilling(companyId)
    if (check.error) return { error: check.error }
    billing = { billable: check.billable, stripeCustomerId: check.stripeCustomerId }
  }

  // Which number this send goes FROM: a sticky pool-number assignment for
  // this (company, customer) pair once CLICKSEND_POOL_NZ/AU is configured,
  // else the single CLICKSEND_FROM number (pre-pool behaviour).
  const from = await resolveOutboundFrom(companyId, dest, country)

  // Delivery receipts are configured account-wide in the ClickSend dashboard
  // (Messaging → Delivery Reports → URL), not per message like Twilio's
  // StatusCallback — so there's nothing to attach here. `custom_string` carries
  // the company id so DLRs/replies can be correlated.
  const res = await fetch('https://rest.clicksend.com/v3/sms/send', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLICKSEND_USERNAME}:${CLICKSEND_API_KEY}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{
        source: 'industryforms',
        ...(from ? { from } : {}),
        to: dest,
        body,
        ...(companyId ? { custom_string: companyId } : {}),
      }],
    }),
  })
  const data = await res.json().catch(() => ({})) as {
    response_code?: string; response_msg?: string
    data?: { messages?: Array<{ message_id?: string; status?: string }> }
  }
  const msg = data.data?.messages?.[0]
  if (!res.ok || data.response_code !== 'SUCCESS' || (msg?.status && msg.status !== 'SUCCESS')) {
    return { error: msg?.status || data.response_msg || `SMS failed (${res.status})` }
  }
  const sid = typeof msg?.message_id === 'string' ? msg.message_id : randomUUID()
  if (companyId) {
    await recordSmsUsage({
      companyId,
      toNumber: dest,
      twilioSid: sid,
      billable: billing.billable,
      stripeCustomerId: billing.stripeCustomerId,
      relatedType,
      relatedId,
    })
  }
  return { id: sid, from }
}

// Fire-and-forget reply to a pool number with no matching session (a cold
// text with no prior outbound history) — no company to attribute it to, no
// billing ledger entry, just a generic bounce so the sender isn't left
// hanging. Used only by the inbound webhook's unmapped-message path.
export async function sendRawSms(from: string, to: string, body: string): Promise<void> {
  if (!smsConfigured()) return
  try {
    await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${CLICKSEND_USERNAME}:${CLICKSEND_API_KEY}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ source: 'industryforms', from, to, body }] }),
    })
  } catch (error) {
    console.error('[sms] unmapped auto-reply failed', error)
  }
}

async function resolveSmsBilling(companyId: string): Promise<{ billable: boolean; stripeCustomerId: string | null; error?: string }> {
  const service = createServiceClient()
  const { data: company, error } = await service
    .from('companies')
    .select('billing_exempt, addons, stripe_customer_id')
    .eq('id', companyId)
    .single()
  if (error || !company) return { billable: false, stripeCustomerId: null, error: 'Company billing profile not found' }
  if (company.billing_exempt) return { billable: false, stripeCustomerId: null }

  const addons = (company.addons ?? {}) as Record<string, { active?: boolean }>
  if (addons.sms_usage?.active !== true) {
    return { billable: false, stripeCustomerId: null, error: SMS_BILLING_DISABLED }
  }
  if (!company.stripe_customer_id) {
    return { billable: false, stripeCustomerId: null, error: 'Stripe customer is missing for SMS billing' }
  }
  return { billable: true, stripeCustomerId: company.stripe_customer_id }
}

export async function retryFailedSmsMeterEvents(limit = 100): Promise<{ retried: number; failed: number }> {
  const service = createServiceClient()
  const { data: rows, error } = await service
    .from('sms_usage_events')
    .select('twilio_sid, stripe_identifier, stripe_meter_event_name, companies(stripe_customer_id)')
    .is('stripe_reported_at', null)
    .not('stripe_identifier', 'is', null)
    .limit(limit)
  if (error || !rows?.length) return { retried: 0, failed: 0 }

  let retried = 0
  let failed = 0
  for (const row of rows as Array<{
    twilio_sid: string
    stripe_identifier: string
    stripe_meter_event_name: string | null
    companies: { stripe_customer_id: string | null } | { stripe_customer_id: string | null }[] | null
  }>) {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
    const stripeCustomerId = company?.stripe_customer_id
    if (!stripeCustomerId) {
      failed += 1
      continue
    }
    try {
      await getStripe().billing.meterEvents.create({
        event_name: row.stripe_meter_event_name ?? (process.env.STRIPE_SMS_METER_EVENT_NAME ?? 'tradiee_sms_message'),
        identifier: row.stripe_identifier,
        payload: { value: '1', stripe_customer_id: stripeCustomerId },
      })
      await service
        .from('sms_usage_events')
        .update({ stripe_reported_at: new Date().toISOString(), stripe_error: null })
        .eq('twilio_sid', row.twilio_sid)
      retried += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'Stripe meter retry failed'
      await service.from('sms_usage_events').update({ stripe_error: message }).eq('twilio_sid', row.twilio_sid)
    }
  }
  return { retried, failed }
}

async function recordSmsUsage(params: {
  companyId: string
  toNumber: string
  twilioSid: string
  billable: boolean
  stripeCustomerId: string | null
  relatedType?: string
  relatedId?: string | null
}) {
  const service = createServiceClient()
  const eventName = process.env.STRIPE_SMS_METER_EVENT_NAME ?? 'tradiee_sms_message'
  const stripeIdentifier = params.billable ? params.twilioSid : null
  const { error: insertError } = await service.from('sms_usage_events').insert({
    company_id: params.companyId,
    twilio_sid: params.twilioSid,
    to_number: params.toNumber,
    units: 1,
    status: 'sent',
    related_type: params.relatedType ?? null,
    related_id: params.relatedId ?? null,
    stripe_meter_event_name: params.billable ? eventName : null,
    stripe_identifier: stripeIdentifier,
  })
  if (insertError) {
    console.error('[sms] usage ledger insert failed', insertError)
  }

  if (!params.billable || !params.stripeCustomerId || !stripeIdentifier) return

  try {
    const stripe = getStripe()
    await stripe.billing.meterEvents.create({
      event_name: eventName,
      identifier: stripeIdentifier,
      payload: {
        value: '1',
        stripe_customer_id: params.stripeCustomerId,
      },
    })
    await service
      .from('sms_usage_events')
      .update({ stripe_reported_at: new Date().toISOString(), stripe_error: null })
      .eq('twilio_sid', params.twilioSid)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe meter event failed'
    console.error('[sms] Stripe meter event failed', message)
    await service.from('sms_usage_events').update({ stripe_error: message }).eq('twilio_sid', params.twilioSid)
  }
}
