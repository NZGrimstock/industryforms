// Fire-once review request after an invoice is paid in full. Safe to call
// from anywhere that flips an invoice to `paid` — the invoices.review_request_sent_at
// column prevents the Stripe webhook and the manual "Record payment" path
// from double-sending if they race.
//
// Sprint E: routed through notifyPreferred() so it's one message (SMS when
// Twilio's live and the customer has a phone, else email) instead of a
// separate flow per channel — same automation_events logging as every other
// notify() call.
//
// No-op when:
//   • the invoice isn't paid yet
//   • the company has no review_link or has disabled the automation
//   • the customer has no email or phone
//   • review_request_sent_at is already set

import type { SupabaseClient } from '@supabase/supabase-js'
import { reviewRequestEmailHtml } from './email'
import { notifyPreferred } from './notify'
import { toE164 } from './sms'

export async function maybeSendReviewRequest(service: SupabaseClient, invoiceId: string) {
  const { data: inv } = await service
    .from('invoices')
    .select(`
      id, invoice_number, status, review_request_sent_at, total, company_id, customer_id,
      customers ( name, email, phone ),
      companies ( name, email, phone, country, logo_url, review_link, review_request_enabled )
    `)
    .eq('id', invoiceId)
    .single()

  if (!inv || inv.status !== 'paid' || inv.review_request_sent_at) return
  const customer = (inv.customers as unknown as { name: string; email: string | null; phone: string | null } | null)
  const company = (inv.companies as unknown as {
    name: string; email: string | null; phone: string | null; country: string | null;
    logo_url: string | null; review_link: string | null; review_request_enabled: boolean
  } | null)
  if (!customer || !company?.review_link || !company.review_request_enabled) return
  if (!customer.email && !customer.phone) return

  const { subject, html } = reviewRequestEmailHtml({
    companyName: company.name,
    customerName: customer.name,
    invoiceNumber: inv.invoice_number,
    reviewUrl: company.review_link,
    companyPhone: company.phone,
    logoUrl: company.logo_url,
  })

  const { data: linkedBooking } = await service.from('bookings').select('id').eq('invoice_id', invoiceId).maybeSingle()

  await notifyPreferred({
    service, companyId: inv.company_id, customerId: inv.customer_id, bookingId: linkedBooking?.id ?? null,
    eventType: 'review_request',
    email: customer.email ? { to: customer.email, subject, html, replyTo: company.email } : undefined,
    sms: customer.phone ? { to: toE164(customer.phone, company.country as 'NZ' | 'AU'), body: `Hi ${customer.name.split(' ')[0]}, thanks for choosing ${company.name}! Mind leaving us a quick review? ${company.review_link}` } : undefined,
  })

  await service.from('invoices').update({ review_request_sent_at: new Date().toISOString() }).eq('id', invoiceId)
  await service.from('communications').insert({
    company_id: inv.company_id,
    customer_id: inv.customer_id,
    channel: 'email', direction: 'outbound',
    subject, summary: `Review request after invoice ${inv.invoice_number} paid`,
    related_type: 'invoice', related_id: invoiceId,
  })
}
