import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { sendEmail, invoiceEmailHtml } from '@/lib/email'
import { logCommunication } from '@/lib/comms'
import { formatCurrency } from '@/lib/utils'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

const bodySchema = z.object({ invoiceId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
  const { invoiceId } = parsed.data
  const service = createServiceClient()

  const { data: callerProfile } = await service.from('profiles').select('timezone').eq('id', auth.userId).single()

  const { data: invoice } = await service
    .from('invoices')
    .select('*, customers(name, email), companies(name, email, phone, logo_url), jobs(title)')
    .eq('id', invoiceId)
    .single()

  if (!invoice || invoice.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const customer = invoice.customers as { name: string; email: string | null }
  if (!customer?.email) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })

  const company = invoice.companies as { name: string; email: string | null; phone: string | null; logo_url: string | null }
  const job = invoice.jobs as { title: string } | null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const viewUrl = `${appUrl}/i/${invoice.public_token}`

  const html = invoiceEmailHtml({
    companyName: company.name,
    customerName: customer.name,
    invoiceNumber: invoice.invoice_number,
    jobTitle: job?.title,
    total: formatCurrency(invoice.total),
    amountDue: formatCurrency(invoice.total - invoice.amount_paid),
    dueDate: invoice.due_date,
    viewUrl,
    companyPhone: company.phone,
    companyEmail: company.email,
    logoUrl: company.logo_url,
    timezone: callerProfile?.timezone ?? DEFAULT_TIMEZONE,
  })

  const result = await sendEmail({
    to: customer.email,
    subject: `Invoice ${invoice.invoice_number} from ${company.name}`,
    html,
    replyTo: company.email ?? undefined,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await service.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoiceId)
  await logCommunication(service, {
    companyId: invoice.company_id, customerId: invoice.customer_id, channel: 'email',
    subject: `Invoice ${invoice.invoice_number} sent`, summary: `Emailed to ${customer.email}`,
    relatedType: 'invoice', relatedId: invoiceId,
  })

  return NextResponse.json({ ok: true })
}
