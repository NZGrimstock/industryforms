import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendSms } from '@/lib/sms'
import { logCommunication } from '@/lib/comms'
import { formatCurrency } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invoiceId } = await req.json()
  const service = createServiceClient()

  const { data: invoice } = await service
    .from('invoices')
    .select('company_id, customer_id, invoice_number, total, amount_paid, public_token, customers(name, phone), companies(name, country)')
    .eq('id', invoiceId)
    .single()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const customer = invoice.customers as unknown as { name: string; phone: string | null } | null
  if (!customer?.phone) return NextResponse.json({ error: 'Customer has no phone number' }, { status: 400 })
  const company = invoice.companies as unknown as { name: string; country: string | null } | null

  const due = Number(invoice.total) - Number(invoice.amount_paid)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const body = `Hi ${customer.name.split(' ')[0]}, invoice ${invoice.invoice_number} from ${company?.name ?? 'us'} — ${formatCurrency(due)} due. View & pay: ${appUrl}/i/${invoice.public_token}`

  const result = await sendSms({ to: customer.phone, body, country: (company?.country as 'NZ' | 'AU') ?? 'NZ' })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  await logCommunication(service, {
    companyId: invoice.company_id, customerId: invoice.customer_id, channel: 'sms',
    subject: `Invoice ${invoice.invoice_number} texted`, summary: `Texted to ${customer.phone}`,
    relatedType: 'invoice', relatedId: invoiceId,
  })
  return NextResponse.json({ ok: true })
}
