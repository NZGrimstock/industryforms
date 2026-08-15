import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { InvoiceDetailClient } from './client'
import { RecurringInvoiceCard } from './recurring-card'
import { SaveInvoiceTemplateButton } from './save-template'
import { logoDataUri } from '@/lib/pdf-logo'
import type { InvoicePdfData } from '@/components/pdf/invoice-pdf'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { PrevNextNav } from '@/components/ui/prev-next-nav'
import { RevertToJobButton } from '@/components/invoices/revert-to-job-button'
import { InvoiceLinesProvider, InvoiceLinesCard, type InvoiceLine } from '@/components/invoices/invoice-lines'
import { CreditNotesCard } from './credit-notes-card'
import { maxCreditableAmount, maxRefundableAmount, availableCreditBalance } from '@/lib/credit-notes'
import { Mail } from 'lucide-react'
import Link from 'next/link'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, timezone, companies!company_id(name, email, phone, gst_number, default_gst_rate, xero_tenant_id, prices_include_tax, payment_instructions, invoice_footer, logo_url)').eq('id', user!.id).single()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, customers(name, email, phone, billing_address, pricing_group_id), jobs(job_number, title), invoice_line_items(*), payments(*)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (!invoice) notFound()

  const [priceItemsRes, kitsRes, { data: invoiceList }, { data: creditNotesOnThisInvoice }, { data: customerCreditNotes }] = await Promise.all([
    supabase.from('price_list_items').select('id, code, name, unit, sell_price, cost_price, type, quantity_on_hand, customer_group_prices(customer_group_id, sell_price)').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('kits').select('*, kit_items(*, price_list_items(*, customer_group_prices(customer_group_id, sell_price)))').eq('company_id', profile!.company_id).order('name'),
    supabase.from('invoices').select('id').eq('company_id', profile!.company_id).order('invoice_number'),
    supabase.from('credit_notes').select('id, credit_note_number, amount, outcome, status, reason, external_id, created_at').eq('source_invoice_id', id).order('created_at', { ascending: false }),
    // Every credit note issued for THIS customer, not just this invoice — this
    // drives the "apply available credit" affordance below, which is a
    // customer-account balance, not an invoice-scoped one.
    supabase.from('credit_notes').select('amount, amount_applied, outcome, status').eq('customer_id', invoice.customer_id).eq('outcome', 'account_credit').neq('status', 'void'),
  ])

  const invoiceIdx = (invoiceList ?? []).findIndex(i => i.id === id)
  const prevInvoiceHref = invoiceIdx > 0 ? `/invoices/${invoiceList![invoiceIdx - 1].id}` : null
  const nextInvoiceHref = invoiceIdx >= 0 && invoiceIdx < (invoiceList?.length ?? 0) - 1 ? `/invoices/${invoiceList![invoiceIdx + 1].id}` : null

  const lines = [...(invoice.invoice_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  const liveCreditsOnThisInvoice = (creditNotesOnThisInvoice ?? []).filter(c => c.status !== 'void')
  const alreadyCredited = liveCreditsOnThisInvoice.reduce((s, c) => s + Number(c.amount), 0)
  const creditable = maxCreditableAmount(Number(invoice.total), alreadyCredited)
  const stripePaidTotal = ((invoice.payments ?? []) as Array<{ amount: number; method: string; stripe_payment_intent_id: string | null }>)
    .filter(p => p.method === 'stripe' && p.stripe_payment_intent_id)
    .reduce((s, p) => s + Number(p.amount), 0)
  const alreadyRefunded = liveCreditsOnThisInvoice.filter(c => c.outcome === 'refund').reduce((s, c) => s + Number(c.amount), 0)
  const refundable = maxRefundableAmount(stripePaidTotal, alreadyRefunded)
  const availableCustomerCredit = availableCreditBalance((customerCreditNotes ?? []) as Parameters<typeof availableCreditBalance>[0])
  const co = profile?.companies as unknown as {name: string; email: string | null; phone: string | null; gst_number: string | null; default_gst_rate: number; xero_tenant_id: string | null; prices_include_tax: boolean | null; payment_instructions: string | null; invoice_footer: string | null; logo_url: string | null} | null
  const gstRate = co?.default_gst_rate ?? 0.15
  const xeroConnected = !!co?.xero_tenant_id
  const printData: InvoicePdfData = {
    invoice: {
      ...invoice,
      payment_instructions: co?.payment_instructions ?? null,
      invoice_footer: co?.invoice_footer ?? null,
    },
    company: {
      name: co?.name ?? '',
      email: co?.email ?? null,
      phone: co?.phone ?? null,
      gst_number: co?.gst_number ?? null,
      logo_url: await logoDataUri(co?.logo_url),
    },
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
  }

  return (
    <>
      <Header title={invoice.invoice_number} profile={profile} />
      <InvoiceLinesProvider
        initialLines={lines as unknown as InvoiceLine[]}
        initialTotals={{
          subtotal: Number(invoice.subtotal),
          discount_amount: Number(invoice.discount_amount),
          discount_type: invoice.discount_type,
          discount_value: Number(invoice.discount_value),
          gst_amount: Number(invoice.gst_amount),
          total: Number(invoice.total),
          amount_paid: Number(invoice.amount_paid),
        }}
      >
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</h2>
              <StatusBadge status={invoice.status} />
              {invoice.emailed_at && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <Mail className="h-3 w-3" /> Emailed
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              <Link href={`/customers/${invoice.customer_id}`} className="text-orange-500 hover:underline">
                {(invoice.customers as {name: string})?.name}
              </Link>
              {invoice.jobs && <> · <Link href={`/jobs/${invoice.job_id}`} className="text-orange-500 hover:underline">{(invoice.jobs as {job_number: string}).job_number}</Link></>}
            </p>
            {invoice.invoice_date && <p className="text-sm text-gray-500 mt-0.5">Invoice date: {formatDate(invoice.invoice_date)}</p>}
            {invoice.due_date && <p className="text-sm text-gray-500 mt-0.5">Due {formatDate(invoice.due_date)}</p>}
            {invoice.sent_at && <p className="text-xs text-gray-400 mt-1">Sent {formatDateTime(invoice.sent_at)}{invoice.viewed_at && ` · Viewed ${formatDateTime(invoice.viewed_at)}`}</p>}
            {invoice.emailed_at && <p className="text-xs text-gray-400 mt-0.5">Emailed {formatDateTime(invoice.emailed_at)}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PrevNextNav prevHref={prevInvoiceHref} nextHref={nextInvoiceHref} />
            <RevertToJobButton invoiceId={invoice.id} jobId={invoice.job_id} status={invoice.status} amountPaid={Number(invoice.amount_paid)} />
            <InvoiceDetailClient
              invoice={{ ...invoice, customer_email: (invoice.customers as {name: string; email: string | null; pricing_group_id?: string | null} | null)?.email, customer_phone: (invoice.customers as {phone: string | null} | null)?.phone, pricing_group_id: (invoice.customers as {pricing_group_id?: string | null} | null)?.pricing_group_id ?? null }}
              companyId={profile!.company_id}
              gstRate={gstRate}
              pricesIncludeTax={!!co?.prices_include_tax}
              xeroConnected={xeroConnected}
              printData={printData}
              priceItems={priceItemsRes.data ?? []}
              kits={kitsRes.data ?? []}
              creditable={creditable}
              refundable={refundable}
              availableCustomerCredit={availableCustomerCredit}
            />
          </div>
          <SaveInvoiceTemplateButton invoiceId={invoice.id} defaultName={invoice.reference || invoice.invoice_number} />
        </div>

        {/* Line items */}
        <InvoiceLinesCard />

        {/* Recurring */}
        <RecurringInvoiceCard
          invoiceId={invoice.id}
          initial={{ isRecurring: !!invoice.is_recurring, rule: invoice.recurrence_rule ?? null, next: invoice.recurrence_next ?? null, end: invoice.recurrence_end ?? null }}
        />

        {/* Credits — only rendered when there's something to show */}
        <CreditNotesCard creditNotes={creditNotesOnThisInvoice ?? []} xeroConnected={xeroConnected} />

        {/* Payments */}
        {(invoice.payments ?? []).length > 0 && (
          <Card>
            <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900">Payments</div>
            <ul className="divide-y divide-gray-50">
              {(invoice.payments as {id: string; amount: number; method: string; paid_at: string; notes: string | null}[]).map(p => (
                <li key={p.id} className="px-6 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-700 capitalize">{p.method.replace(/_/g, ' ')}</span>
                    {p.notes && <span className="text-gray-400 ml-2 text-xs">· {p.notes}</span>}
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-600">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-gray-400">{formatDate(p.paid_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Customer link */}
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Customer payment link</p>
              <p className="text-xs text-gray-400">Share with customer to view and pay online</p>
            </div>
            <a href={`/i/${invoice.public_token}`} target="_blank" className="text-sm text-orange-500 hover:underline">Open invoice →</a>
          </CardContent>
        </Card>
      </div>
      </InvoiceLinesProvider>
    </>
  )
}
