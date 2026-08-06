// GET /api/statements/[customerId]/pdf — renders that customer's statement of
// account (outstanding invoices only) and returns a short-lived presigned R2
// URL. Same shape as /api/invoices/[id]/pdf. Must run in Node.js (react-pdf).
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { renderStatementPdfBuffer } from '@/lib/pdf/render-statement'
import { buildCustomerStatements, type StatementInvoice } from '@/lib/statement'
import { putObject, presignedDownload, PRIVATE_BUCKET } from '@/lib/r2'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { logoDataUri } from '@/lib/pdf-logo'

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('timezone').eq('id', auth.userId).single()

  const [{ data: customer }, { data: company }, { data: invoices }] = await Promise.all([
    service.from('customers').select('name, email, billing_address').eq('id', customerId).eq('company_id', auth.companyId).single(),
    service.from('companies').select('name, email, phone, gst_number, logo_url').eq('id', auth.companyId).single(),
    service.from('invoices').select('id, customer_id, invoice_number, status, total, amount_paid, due_date, created_at')
      .eq('company_id', auth.companyId).eq('customer_id', customerId).in('status', ['sent', 'partially_paid', 'overdue']),
  ])

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const statements = buildCustomerStatements((invoices ?? []) as StatementInvoice[])
  const statement = statements.get(customerId)
  if (!statement) return NextResponse.json({ error: 'No outstanding balance' }, { status: 404 })

  const data = {
    customer: { name: customer.name, email: customer.email, billing_address: customer.billing_address },
    statement,
    company: {
      name: company?.name ?? '',
      email: company?.email ?? null,
      phone: company?.phone ?? null,
      gst_number: company?.gst_number ?? null,
      logo_url: await logoDataUri(company?.logo_url),
    },
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    asOf: new Date().toISOString(),
  }

  const pdfBuffer = await renderStatementPdfBuffer(data)
  const key = `${auth.companyId}/statements/${customerId}-${Date.now()}.pdf`
  await putObject(PRIVATE_BUCKET, key, pdfBuffer, 'application/pdf')
  const url = await presignedDownload(key, 60 * 10)

  return NextResponse.json({ url, filename: `Statement - ${customer.name}.pdf` })
}
