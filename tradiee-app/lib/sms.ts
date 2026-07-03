// SMS via Twilio. Mirrors lib/email.ts: a guarded sender that no-ops (without
// throwing) when not configured, so builds/runtime never depend on SMS being set up.
import { createHmac, timingSafeEqual } from 'crypto'

const SID = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = process.env.TWILIO_FROM_NUMBER

export function smsConfigured(): boolean {
  return !!(SID && TOKEN && FROM)
}

/**
 * Verify Twilio's X-Twilio-Signature on an inbound webhook request.
 * Algorithm (no SDK — the `twilio` package isn't a dependency here, and this
 * is a single well-documented HMAC-SHA1 computation):
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url)
  const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
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

export async function sendSms(
  { to, body, country = 'NZ' }: { to: string | null | undefined; body: string; country?: 'NZ' | 'AU' }
): Promise<{ id?: string; error?: string }> {
  if (!SID || !TOKEN || !FROM) {
    console.warn('Twilio not configured — SMS not sent')
    return { error: 'SMS service not configured' }
  }
  const dest = toE164(to, country)
  if (!dest) return { error: 'No valid phone number' }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: FROM, To: dest, Body: body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.message ?? `SMS failed (${res.status})` }
  return { id: data.sid }
}
