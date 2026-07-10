import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { sendSms } from '@/lib/sms'
import { logCommunication } from '@/lib/comms'

const bodySchema = z.object({ quoteId: z.string().uuid() })

export async function POST(req: NextRequest) {
  // Cookie (web) or Bearer token (mobile) auth, company-scoped
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'quoteId required' }, { status: 400 })
  const { quoteId } = parsed.data
  const service = createServiceClient()

  const { data: quote } = await service
    .from('quotes')
    .select('company_id, customer_id, quote_number, title, public_token, customers(name, phone), companies(name, country)')
    .eq('id', quoteId)
    .single()
  if (!quote || quote.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  const customer = quote.customers as unknown as { name: string; phone: string | null } | null
  if (!customer?.phone) return NextResponse.json({ error: 'Customer has no phone number' }, { status: 400 })
  const company = quote.companies as unknown as { name: string; country: string | null } | null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const body = `Hi ${customer.name.split(' ')[0]}, here's quote ${quote.quote_number} from ${company?.name ?? 'us'}: ${appUrl}/q/${quote.public_token}`

  const result = await sendSms({
    to: customer.phone,
    body,
    country: (company?.country as 'NZ' | 'AU') ?? 'NZ',
    companyId: quote.company_id,
    relatedType: 'quote',
    relatedId: quoteId,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await service.from('quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quoteId).eq('status', 'draft')
  await logCommunication(service, {
    companyId: quote.company_id, customerId: quote.customer_id, channel: 'sms',
    subject: `Quote ${quote.quote_number} texted`, summary: `Texted to ${customer.phone}`,
    relatedType: 'quote', relatedId: quoteId,
  })
  return NextResponse.json({ ok: true })
}
