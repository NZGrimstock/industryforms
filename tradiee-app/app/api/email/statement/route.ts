// POST /api/email/statement — emails one customer's statement of account
// (itemized in the email body, same PDF attached). Node runtime for react-pdf.
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { statementEmailHtml } from '@/lib/email'
import { notify } from '@/lib/notify'
import { logCommunication } from '@/lib/comms'
import { formatCurrency } from '@/lib/utils'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { renderStatementPdfBuffer } from '@/lib/pdf/render-statement'
import { buildCustomerStatements, type StatementInvoice } from '@/lib/statement'
import { logoDataUri } from '@/lib/pdf-logo'

const bodySchema = z.object({ customerId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  const { customerId } = parsed.data
  const service = createServiceClient()

  const [{ data: callerProfile }, { data: customer }, { data: company }, { data: invoices }] = await Promise.all([
    service.from('profiles').select('timezone').eq('id', auth.userId).single(),
    service.from('customers').select('name, email, billing_address').eq('id', customerId).eq('company_id', auth.companyId).single(),
    service.from('companies').select('name, email, phone, gst_number, logo_url').eq('id', auth.companyId).single(),
    service.from('invoices').select('id, customer_id, invoice_number, status, total, amount_paid, due_date, created_at')
      .eq('company_id', auth.companyId).eq('customer_id', customerId).in('status', ['sent', 'partially_paid', 'overdue']),
  ])

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (!customer.email) return NextResponse.json({ error: 'Customer has no email address' }, { status: 400 })

  const statement = buildCustomerStatements((invoices ?? []) as StatementInvoice[]).get(customerId)
  if (!statement) return NextResponse.json({ error: 'No outstanding balance' }, { status: 400 })

  const timezone = callerProfile?.timezone ?? DEFAULT_TIMEZONE
  const companyName = company?.name ?? ''

  const html = statementEmailHtml({
    companyName,
    customerName: customer.name,
    lines: [...statement.lines].sort((a, b) => a.date.localeCompare(b.date)).map(l => ({
      invoiceNumber: l.invoice_number, date: l.date, dueDate: l.due_date, balance: formatCurrency(l.balance),
    })),
    totalOutstanding: formatCurrency(statement.outstanding),
    companyPhone: company?.phone,
    companyEmail: company?.email,
    logoUrl: company?.logo_url,
    timezone,
  })

  const pdfBuffer = await renderStatementPdfBuffer({
    customer: { name: customer.name, email: customer.email, billing_address: customer.billing_address },
    statement,
    company: {
      name: companyName, email: company?.email ?? null, phone: company?.phone ?? null,
      gst_number: company?.gst_number ?? null, logo_url: await logoDataUri(company?.logo_url),
    },
    timezone,
    asOf: new Date().toISOString(),
  })

  const [emailResult] = await notify({
    service,
    companyId: auth.companyId,
    customerId,
    eventType: 'statement_email',
    email: {
      to: customer.email, subject: `Statement from ${companyName}`, html, replyTo: company?.email ?? null,
      attachments: [{ filename: `Statement - ${customer.name}.pdf`, content: pdfBuffer.toString('base64') }],
    },
  })

  if (emailResult?.status !== 'sent') {
    return NextResponse.json({ error: emailResult?.error ?? 'Failed to send email' }, { status: 500 })
  }

  await logCommunication(service, {
    companyId: auth.companyId, customerId, channel: 'email',
    subject: 'Statement sent', summary: `Emailed to ${customer.email} (${formatCurrency(statement.outstanding)} outstanding)`,
    relatedType: 'statement', relatedId: customerId,
  })

  return NextResponse.json({ ok: true })
}
