import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'
import { logCommunication } from '@/lib/comms'

// Inbound email → enquiry, via Resend's Inbound feature.
//
// Setup: add an MX record for inbound.industryforms.app pointing at Resend
// (Resend dashboard → Domains → Receiving), then create a webhook (Resend
// dashboard → Webhooks) subscribed to `email.received`, endpoint
// POST https://app.industryforms.app/api/inbound/email, and put its signing
// secret in RESEND_WEBHOOK_SECRET. See
// https://resend.com/docs/dashboard/receiving/introduction
//
// The recipient address encodes the company token, e.g.
//   <token>@inbound.industryforms.app  (token = companies.inbound_email_token)
//
// Resend's webhook payload is metadata only (from/to/subject, no body) — the
// full text has to be fetched separately via the Receiving API using
// email_id, which is why this needs the Resend SDK rather than a plain
// fetch() like lib/email.ts uses for sending.
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) return NextResponse.json({ error: 'Inbound email not configured' }, { status: 501 })

  const resend = new Resend(process.env.RESEND_API_KEY)
  const rawBody = await req.text()

  let event
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: req.headers.get('svix-id') ?? '',
        timestamp: req.headers.get('svix-timestamp') ?? '',
        signature: req.headers.get('svix-signature') ?? '',
      },
      webhookSecret,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Resend sends every subscribed event type to the same endpoint — only
  // email.received matters here.
  if (event.type !== 'email.received') return NextResponse.json({ ok: true })
  const { email_id, to, from, subject } = event.data

  // Extract the company token from the local part of the recipient address.
  const localPart = (to[0]?.match(/<?([^@<>\s]+)@/)?.[1] ?? '').toLowerCase()
  const token = localPart.includes('+') ? localPart.split('+').pop()! : localPart
  if (!token) return NextResponse.json({ error: 'No recipient token' }, { status: 400 })

  const service = createServiceClient()
  const { data: company } = await service.from('companies').select('id').eq('inbound_email_token', token).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Unknown inbox' }, { status: 404 })

  // The webhook event carries no body — fetch the full message separately.
  const { data: full } = await resend.emails.receiving.get(email_id)
  const text = full?.text ?? full?.html ?? ''

  // Parse a sender name + email from the From header ("Jane Doe <jane@x.com>").
  const emailMatch = from.match(/<?([^<>\s]+@[^<>\s]+)>?/)
  const senderEmail = emailMatch?.[1] ?? from
  const senderName = from.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || senderEmail || 'Email enquiry'

  const { data: enquiry } = await service.from('enquiries').insert({
    company_id: company.id,
    customer_name: senderName.slice(0, 200),
    customer_email: senderEmail,
    description: `${subject}\n\n${text}`.slice(0, 4000),
    source: 'email',
    status: 'new',
  }).select('id').single()

  await logCommunication(service, {
    companyId: company.id, channel: 'email', direction: 'inbound',
    subject: subject.slice(0, 200), summary: `From ${senderEmail}`,
    relatedType: 'enquiry', relatedId: enquiry?.id,
  })

  return NextResponse.json({ ok: true })
}
