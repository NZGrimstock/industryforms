// Fire-once review request after an invoice is paid in full. Safe to call
// from anywhere that flips an invoice to `paid` — the invoices.review_request_sent_at
// column prevents the Stripe webhook and the manual "Record payment" path
// from double-sending if they race.
//
// No-op when:
//   • the invoice isn't paid yet
//   • the company has no review_link or has disabled the automation
//   • the customer has no email
//   • review_request_sent_at is already set
//   • RESEND_API_KEY isn't configured (sendEmail no-ops with a warn)

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, reviewRequestEmailHtml } from './email'

export async function maybeSendReviewRequest(service: SupabaseClient, invoiceId: string) {
  const { data: inv } = await service
    .from('invoices')
    .select(`
      id, invoice_number, status, review_request_sent_at, total,
      customers ( name, email ),
      companies ( name, email, phone, review_link, review_request_enabled )
    `)
    .eq('id', invoiceId)
    .single()

  if (!inv || inv.status !== 'paid' || inv.review_request_sent_at) return
  const customer = (inv.customers as unknown as { name: string; email: string | null } | null)
  const company = (inv.companies as unknown as {
    name: string; email: string | null; phone: string | null;
    review_link: string | null; review_request_enabled: boolean
  } | null)
  if (!customer?.email || !company?.review_link || !company.review_request_enabled) return

  const { subject, html } = reviewRequestEmailHtml({
    companyName: company.name,
    customerName: customer.name,
    invoiceNumber: inv.invoice_number,
    reviewUrl: company.review_link,
    companyPhone: company.phone,
  })
  const result = await sendEmail({ to: customer.email, subject, html, replyTo: company.email ?? undefined })
  if ('error' in result) return

  await service.from('invoices').update({ review_request_sent_at: new Date().toISOString() }).eq('id', invoiceId)
  await service.from('communications').insert({
    company_id: (await service.from('invoices').select('company_id').eq('id', invoiceId).single()).data?.company_id,
    customer_id: (await service.from('invoices').select('customer_id').eq('id', invoiceId).single()).data?.customer_id,
    channel: 'email', direction: 'outbound',
    subject, summary: `Review request after invoice ${inv.invoice_number} paid`,
    related_type: 'invoice', related_id: invoiceId,
  })
}
