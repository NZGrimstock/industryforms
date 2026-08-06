import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { sendSms } from '@/lib/sms'
import { logCommunication } from '@/lib/comms'
import { formatCurrency } from '@/lib/utils'
import { buildCustomerStatements, type StatementInvoice } from '@/lib/statement'

const bodySchema = z.object({ customerId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  const { customerId } = parsed.data
  const service = createServiceClient()

  const [{ data: customer }, { data: company }, { data: invoices }] = await Promise.all([
    service.from('customers').select('name, phone').eq('id', customerId).eq('company_id', auth.companyId).single(),
    service.from('companies').select('name, country').eq('id', auth.companyId).single(),
    service.from('invoices').select('id, customer_id, invoice_number, status, total, amount_paid, due_date, created_at')
      .eq('company_id', auth.companyId).eq('customer_id', customerId).in('status', ['sent', 'partially_paid', 'overdue']),
  ])

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (!customer.phone) return NextResponse.json({ error: 'Customer has no phone number' }, { status: 400 })

  const statement = buildCustomerStatements((invoices ?? []) as StatementInvoice[]).get(customerId)
  if (!statement) return NextResponse.json({ error: 'No outstanding balance' }, { status: 400 })

  const body = `Hi ${customer.name.split(' ')[0]}, your account with ${company?.name ?? 'us'} has an outstanding balance of ${formatCurrency(statement.outstanding)} across ${statement.lines.length} invoice${statement.lines.length === 1 ? '' : 's'}. We've emailed your statement — get in touch if you have any questions.`

  const result = await sendSms({
    to: customer.phone,
    body,
    country: (company?.country as 'NZ' | 'AU') ?? 'NZ',
    companyId: auth.companyId,
    relatedType: 'statement',
    relatedId: customerId,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await logCommunication(service, {
    companyId: auth.companyId, customerId, channel: 'sms',
    subject: 'Statement texted', summary: `Texted to ${customer.phone} (${formatCurrency(statement.outstanding)} outstanding)`,
    relatedType: 'statement', relatedId: customerId,
  })
  return NextResponse.json({ ok: true })
}
