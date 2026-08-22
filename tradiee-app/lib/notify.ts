// Channel-aware notification helper (Sprint E). Every send is logged to
// automation_events so admins can see what fired, what's dark, what failed.
//
// Email is live (Resend). SMS is built but dark until Twilio is configured —
// `smsConfigured()` gates it, so a dark SMS logs as `skipped_sms_dark` instead
// of silently vanishing, and flips to actually sending with zero code changes
// once Twilio go-live happens.
import { sendEmail } from '@/lib/email'
import { isSmsBillingDisabledError, sendSms, smsConfigured } from '@/lib/sms'

type EmailPayload = { to: string | null; subject: string; html: string; replyTo?: string | null; attachments?: Array<{ filename: string; content: string }> }
type SmsPayload = { to: string | null; country?: 'NZ' | 'AU'; body: string }
export type NotificationResult = { channel: 'email' | 'sms'; status: string; error?: string | null }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// Exported so callers that can't route through notify()/notifyPreferred()
// (quote-followup/invoice-dunning in reminders/route.ts want to keep their
// own sendSms() relatedType/relatedId — notify()'s internal call only ever
// tags SMS billing metadata with a bookingId) can still log the same
// automation_events trail by hand.
export async function logEvent(service: SupabaseClient, row: {
  companyId: string; customerId?: string | null; bookingId?: string | null
  eventType: string; channel: 'email' | 'sms'; status: string; error?: string | null
}) {
  await service.from('automation_events').insert({
    company_id: row.companyId,
    customer_id: row.customerId ?? null,
    booking_id: row.bookingId ?? null,
    event_type: row.eventType,
    channel: row.channel,
    status: row.status,
    error: row.error ?? null,
    sent_at: row.status === 'sent' ? new Date().toISOString() : null,
  })
}

/**
 * Send `eventType` to whichever channels have a recipient. Both email and sms
 * are attempted independently when both payloads are supplied (belt-and-
 * suspenders for confirmations/reminders — the doc doesn't ask for de-dup
 * there). Pass only one payload for a single-channel notification.
 */
export async function notify(params: {
  service: SupabaseClient
  companyId: string
  customerId?: string | null
  bookingId?: string | null
  eventType: string
  email?: EmailPayload
  sms?: SmsPayload
}) {
  const { service, companyId, customerId, bookingId, eventType, email, sms } = params
  const results: NotificationResult[] = []

  if (email?.to) {
    const result = await sendEmail({ to: email.to, subject: email.subject, html: email.html, replyTo: email.replyTo ?? undefined, attachments: email.attachments })
    const status = result.error ? 'failed' : 'sent'
    await logEvent(service, {
      companyId, customerId, bookingId, eventType, channel: 'email',
      status, error: result.error,
    })
    results.push({ channel: 'email', status, error: result.error })
  }

  if (sms?.to) {
    if (!smsConfigured()) {
      await logEvent(service, { companyId, customerId, bookingId, eventType, channel: 'sms', status: 'skipped_sms_dark' })
      results.push({ channel: 'sms', status: 'skipped_sms_dark' })
    } else {
      const result = await sendSms({ to: sms.to, country: sms.country, body: sms.body, companyId, relatedType: eventType, relatedId: bookingId ?? undefined })
      const status = isSmsBillingDisabledError(result.error) ? 'skipped_sms_billing_off' : result.error ? 'failed' : 'sent'
      await logEvent(service, {
        companyId, customerId, bookingId, eventType, channel: 'sms',
        status, error: result.error,
      })
      results.push({ channel: 'sms', status, error: result.error })
    }
  }

  return results
}

/**
 * Review requests should be one message, not two — prefer SMS (higher open
 * rate) when Twilio is live and the customer has a phone, else email. Still
 * logs a `skipped_sms_dark` row when SMS was the intended channel but Twilio
 * isn't configured, so nothing silently vanishes.
 */
export async function notifyPreferred(params: {
  service: SupabaseClient
  companyId: string
  customerId?: string | null
  bookingId?: string | null
  eventType: string
  email?: EmailPayload
  sms?: SmsPayload
}) {
  const { service, companyId, customerId, bookingId, eventType, email, sms } = params
  const preferSms = !!sms?.to
  const results: NotificationResult[] = []

  if (preferSms && smsConfigured()) {
    const result = await sendSms({ to: sms!.to, country: sms!.country, body: sms!.body, companyId, relatedType: eventType, relatedId: bookingId ?? undefined })
    const status = isSmsBillingDisabledError(result.error) ? 'skipped_sms_billing_off' : result.error ? 'failed' : 'sent'
    await logEvent(service, {
      companyId, customerId, bookingId, eventType, channel: 'sms',
      status, error: result.error,
    })
    results.push({ channel: 'sms', status, error: result.error })
    if (!result.error) return results
  } else if (preferSms) {
    await logEvent(service, { companyId, customerId, bookingId, eventType, channel: 'sms', status: 'skipped_sms_dark' })
    results.push({ channel: 'sms', status: 'skipped_sms_dark' })
  }

  if (email?.to) {
    const result = await sendEmail({ to: email.to, subject: email.subject, html: email.html, replyTo: email.replyTo ?? undefined, attachments: email.attachments })
    const status = result.error ? 'failed' : 'sent'
    await logEvent(service, {
      companyId, customerId, bookingId, eventType, channel: 'email',
      status, error: result.error,
    })
    results.push({ channel: 'email', status, error: result.error })
  }

  return results
}
