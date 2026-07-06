import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, quoteEmailHtml } from '@/lib/email'
import { logCommunication } from '@/lib/comms'
import { formatCurrency } from '@/lib/utils'

export async function POST(req: NextRequest) {
  // Cookie-based auth (web) — fall back to Bearer token (mobile)
  const supabase = await createClient()
  let { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const bearer = req.headers.get('authorization')
    if (bearer?.startsWith('Bearer ')) {
      const { data } = await createServiceClient().auth.getUser(bearer.slice(7))
      user = data.user
    }
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteId } = await req.json()
  const service = createServiceClient()

  const { data: quote } = await service
    .from('quotes')
    .select('*, customers(name, email), companies(name, email, phone, logo_url), quote_sections(quote_line_items(quantity, unit_price))')
    .eq('id', quoteId)
    .single()

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  const customer = quote.customers as { name: string; email: string | null }
  if (!customer?.email) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })

  const company = quote.companies as { name: string; email: string | null; phone: string | null; logo_url: string | null }

  const sections = (quote.quote_sections ?? []) as Array<{ quote_line_items: Array<{ quantity: number; unit_price: number }> }>
  const subtotal = sections.flatMap(s => s.quote_line_items).reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const viewUrl = `${appUrl}/q/${quote.public_token}`

  const html = quoteEmailHtml({
    companyName: company.name,
    customerName: customer.name,
    quoteNumber: quote.quote_number,
    quoteTitle: quote.title,
    total: formatCurrency(subtotal),
    expiresAt: quote.expires_at,
    viewUrl,
    companyPhone: company.phone,
    companyEmail: company.email,
    logoUrl: company.logo_url,
  })

  const result = await sendEmail({
    to: customer.email,
    subject: `Quote ${quote.quote_number} from ${company.name}`,
    html,
    replyTo: company.email ?? undefined,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await service.from('quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quoteId)
  await logCommunication(service, {
    companyId: quote.company_id, customerId: quote.customer_id, channel: 'email',
    subject: `Quote ${quote.quote_number} sent`, summary: `Emailed to ${customer.email}`,
    relatedType: 'quote', relatedId: quoteId,
  })

  return NextResponse.json({ ok: true })
}
