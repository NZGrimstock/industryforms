import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logCommunication } from '@/lib/comms'

// Inbound email → enquiry. Point your email provider's inbound/parse webhook
// (Resend inbound, SendGrid Inbound Parse, Cloudflare Email Worker, etc.) at:
//   POST /api/inbound/email?secret=<INBOUND_EMAIL_SECRET>
// The recipient address encodes the company token, e.g.
//   <token>@inbound.industryforms.app  (token = companies.inbound_email_token)
//
// Accepts the common payload shapes (to/from/subject/text or recipient/sender).
export async function POST(req: NextRequest) {
  if (process.env.INBOUND_EMAIL_SECRET && req.nextUrl.searchParams.get('secret') !== process.env.INBOUND_EMAIL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* some providers send form-encoded */ }

  const pick = (...keys: string[]) => keys.map(k => body[k]).find(v => typeof v === 'string') as string | undefined
  const to = pick('to', 'recipient', 'To') ?? ''
  const from = pick('from', 'sender', 'From') ?? ''
  const subject = pick('subject', 'Subject') ?? '(no subject)'
  const text = pick('text', 'body-plain', 'stripped-text', 'html') ?? ''

  // Extract the company token from the local part of the recipient address.
  const localPart = (to.match(/<?([^@<>\s]+)@/)?.[1] ?? '').toLowerCase()
  const token = localPart.includes('+') ? localPart.split('+').pop()! : localPart
  if (!token) return NextResponse.json({ error: 'No recipient token' }, { status: 400 })

  const service = createServiceClient()
  const { data: company } = await service.from('companies').select('id').eq('inbound_email_token', token).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Unknown inbox' }, { status: 404 })

  // Parse a sender name + email from the From header ("Jane Doe <jane@x.com>").
  const emailMatch = from.match(/<?([^<>\s]+@[^<>\s]+)>?/)
  const senderEmail = emailMatch?.[1] ?? null
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
    subject: subject.slice(0, 200), summary: `From ${senderEmail ?? senderName}`,
    relatedType: 'enquiry', relatedId: enquiry?.id,
  })

  return NextResponse.json({ ok: true })
}
