import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
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
import { InvoiceLinesProvider, type InvoiceLine } from '@/components/invoices/invoice-lines'
import { InvoicePaperLines } from '@/components/invoices/invoice-paper-lines'
import { PaperDateInput } from '@/components/documents/paper-date-input'
import { paperCompany } from '@/lib/paper-company'
import {
  DocumentWorkspace, Paper, PaperHeader, PaperFields, PaperColumns, PaperBlock, PaperSignatures, PaperNotes,
  PaperFootnote, PaperLegend, InternalRail, RailCard, RailRow,
} from '@/components/documents/paper'
import { CreditNotesCard } from './credit-notes-card'
import { effectivePlanKey } from '@/lib/billing'
import { maxCreditableAmount, maxRefundableAmount, availableCreditBalance } from '@/lib/credit-notes'
import { Mail } from 'lucide-react'
import Link from 'next/link'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, timezone, companies!company_id(name, email, phone, gst_number, default_gst_rate, xero_tenant_id, prices_include_tax, payment_instructions, invoice_footer, logo_url, subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until)').eq('id', user!.id).single()

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
  const co = profile?.companies as unknown as {
    name: string; email: string | null; phone: string | null; gst_number: string | null; default_gst_rate: number
    xero_tenant_id: string | null; prices_include_tax: boolean | null; payment_instructions: string | null; invoice_footer: string | null; logo_url: string | null
    subscription_plan: string | null; subscription_status: string | null; trial_ends_at: string | null; billing_exempt: boolean | null
    comp_plan: string | null; comp_until: string | null
  } | null
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
      isFreePlan: effectivePlanKey(co) === 'free',
    },
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
  }

  const isDraft = invoice.status === 'draft'
  const isFreePlan = effectivePlanKey(co) === 'free'
  const customer = invoice.customers as { name: string; email: string | null; billing_address: string | null } | null
  const job = invoice.jobs as { job_number: string; title: string } | null
  const payments = (invoice.payments ?? []) as { id: string; amount: number; method: string; paid_at: string; notes: string | null }[]

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
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">
              <Link href="/invoices" className="hover:underline">Invoices</Link> / <b className="font-semibold text-gray-900">{invoice.invoice_number}</b>
            </span>
            <StatusBadge status={invoice.status} />
            {invoice.emailed_at && (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                <Mail className="h-3 w-3" /> Emailed
              </span>
            )}
            <span className="flex-1" />
            <PrevNextNav prevHref={prevInvoiceHref} nextHref={nextInvoiceHref} />
            <RevertToJobButton invoiceId={invoice.id} jobId={invoice.job_id} status={invoice.status} amountPaid={Number(invoice.amount_paid)} />
            <SaveInvoiceTemplateButton invoiceId={invoice.id} defaultName={invoice.reference || invoice.invoice_number} />
          </div>
          <div className="mb-3">
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
          <PaperLegend />

          <DocumentWorkspace>
            <Paper label={`Invoice ${invoice.invoice_number}`}>
              <PaperHeader company={paperCompany(co)} docLabel="Invoice" docNumber={invoice.invoice_number} />
              <PaperFields
                fields={[
                  { label: 'Date of invoice', value: <PaperDateInput table="invoices" id={invoice.id} column="invoice_date" value={invoice.invoice_date} editable={isDraft} label="Date of invoice" /> },
                  { label: 'Invoice No.', value: invoice.invoice_number },
                  { label: 'Payment due date', value: <PaperDateInput table="invoices" id={invoice.id} column="due_date" value={invoice.due_date} editable={isDraft} label="Payment due date" /> },
                ]}
              />
              <PaperColumns>
                <PaperBlock title="Client">
                  <Link href={`/customers/${invoice.customer_id}`} className="hover:underline">{customer?.name}</Link>
                  {customer?.billing_address ? <div className="whitespace-pre-wrap">{customer.billing_address}</div> : null}
                  {customer?.email ? <div>{customer.email}</div> : null}
                </PaperBlock>
                <PaperBlock title="Job">
                  {job ? <Link href={`/jobs/${invoice.job_id}`} className="hover:underline">{job.job_number} - {job.title}</Link> : null}
                </PaperBlock>
              </PaperColumns>

              <InvoicePaperLines invoiceId={invoice.id} editable={isDraft} gstRate={gstRate} pricesIncludeTax={!!co?.prices_include_tax} />

              <PaperSignatures left="Customer signature" right="Authorised signature" />
              <PaperNotes
                blocks={[
                  ...(co?.payment_instructions ? [{ title: 'Bank account details', content: co.payment_instructions }] : []),
                  { title: 'Payment terms', content: co?.invoice_footer ?? 'Payment is due by the date marked above. Thank you for your business.' },
                ]}
              />
              <PaperFootnote show={isFreePlan} />
            </Paper>

            <InternalRail label="Internal — not on the invoice">
              {!isDraft && invoice.status !== 'void' && (
                <RailCard tone="info" title="Locked — this invoice has been issued">
                  <p className="text-[13px] leading-normal text-gray-700">
                    The page is now the record of what the customer received. To change it, revert it to draft
                    {Number(invoice.amount_paid) > 0 ? ' (not possible once a payment is recorded)' : ''} or credit it.
                  </p>
                </RailCard>
              )}
              {isDraft && (
                <RailCard>
                  <p className="text-[13px] leading-normal text-gray-600">Click any line on the invoice to change it. Each change saves when you leave the line. Bank details and payment terms come from Settings.</p>
                </RailCard>
              )}

              <RailCard title="Payments">
                {payments.length === 0 ? (
                  <p className="text-[13px] text-gray-600">No payments yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {payments.map(p => (
                      <li key={p.id} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                        <span>
                          <span className="capitalize text-gray-800">{p.method.replace(/_/g, ' ')}</span>
                          <span className="block text-xs text-gray-500">{formatDate(p.paid_at)}{p.notes ? ` · ${p.notes}` : ''}</span>
                        </span>
                        <span className="font-semibold text-green-700">{formatCurrency(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-1 border-t border-gray-200 pt-1">
                  <RailRow label="Outstanding" value={formatCurrency(Number(invoice.total) - Number(invoice.amount_paid))} />
                </div>
              </RailCard>

              <CreditNotesCard creditNotes={creditNotesOnThisInvoice ?? []} xeroConnected={xeroConnected} />

              <RecurringInvoiceCard
                invoiceId={invoice.id}
                initial={{ isRecurring: !!invoice.is_recurring, rule: invoice.recurrence_rule ?? null, next: invoice.recurrence_next ?? null, end: invoice.recurrence_end ?? null }}
              />

              <RailCard title="Activity">
                {invoice.sent_at ? <RailRow label="Sent" value={formatDateTime(invoice.sent_at)} /> : <p className="text-[13px] text-gray-600">Not sent yet.</p>}
                {invoice.viewed_at && <RailRow label="Viewed" value={formatDateTime(invoice.viewed_at)} />}
                {invoice.emailed_at && <RailRow label="Emailed" value={formatDateTime(invoice.emailed_at)} />}
              </RailCard>

              <RailCard title="Customer payment link">
                <p className="mb-2 text-[13px] text-gray-600">Share with the customer to view and pay online.</p>
                <a href={`/i/${invoice.public_token}`} target="_blank" className="text-sm font-medium text-orange-700 hover:underline">Open invoice →</a>
              </RailCard>
            </InternalRail>
          </DocumentWorkspace>
        </div>
      </div>
      </InvoiceLinesProvider>
    </>
  )
}
