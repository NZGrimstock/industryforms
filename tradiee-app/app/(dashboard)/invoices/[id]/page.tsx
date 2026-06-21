import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { discountLabel } from '@/lib/pricing'
import { InvoiceDetailClient } from './client'
import { RecurringInvoiceCard } from './recurring-card'
import Link from 'next/link'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, companies(name, email, phone, gst_number, default_gst_rate, xero_tenant_id)').eq('id', user!.id).single()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, customers(name, email, phone, billing_address), jobs(job_number, title), invoice_line_items(*), payments(*)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (!invoice) notFound()

  const lines = [...(invoice.invoice_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const co = profile?.companies as unknown as {default_gst_rate: number; xero_tenant_id: string | null} | null
  const gstRate = co?.default_gst_rate ?? 0.15
  const xeroConnected = !!co?.xero_tenant_id

  return (
    <>
      <Header title={invoice.invoice_number} profile={profile} />
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</h2>
              <StatusBadge status={invoice.status} />
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
          </div>
          <InvoiceDetailClient
            invoice={{ ...invoice, customer_email: (invoice.customers as {name: string; email: string | null} | null)?.email, customer_phone: (invoice.customers as {phone: string | null} | null)?.phone }}
            companyId={profile!.company_id}
            gstRate={gstRate}
            xeroConnected={xeroConnected}
          />
        </div>

        {/* Line items */}
        <Card className="overflow-hidden">
          {lines.length === 0 ? (
            <CardContent className="py-8 text-center text-sm text-gray-400">No line items — add them below</CardContent>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
                  <th className="text-left px-6 py-2 font-medium">Description</th>
                  <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Unit price</th>
                  <th className="text-right px-3 py-2 font-medium w-20">Disc.</th>
                  <th className="text-right px-6 py-2 font-medium w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3 text-gray-700">{l.description}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{l.quantity} {l.unit}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(l.unit_price)}</td>
                    <td className="px-3 py-3 text-right text-gray-400">{discountLabel(l.discount_type, Number(l.discount_value)) || '—'}</td>
                    <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-100">
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-600">Subtotal</td>
                  <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(invoice.subtotal)}</td>
                </tr>
                {Number(invoice.discount_amount) > 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-2 text-right text-sm text-green-600">Discount{invoice.discount_type === 'percent' ? ` (${Number(invoice.discount_value)}%)` : ''}</td>
                    <td className="px-6 py-2 text-right text-sm text-green-600">−{formatCurrency(invoice.discount_amount)}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">GST ({Math.round(gstRate * 100)}%)</td>
                  <td className="px-6 py-2 text-right text-sm font-medium text-gray-900">{formatCurrency(invoice.gst_amount)}</td>
                </tr>
                <tr className="border-t border-gray-200">
                  <td colSpan={4} className="px-6 py-3 text-right font-semibold text-gray-900">Total</td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900 text-base">{formatCurrency(invoice.total)}</td>
                </tr>
                {invoice.amount_paid > 0 && (
                  <>
                    <tr>
                      <td colSpan={4} className="px-6 py-2 text-right text-sm text-green-600">Paid</td>
                      <td className="px-6 py-2 text-right text-sm text-green-600">-{formatCurrency(invoice.amount_paid)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-6 py-2 text-right font-semibold text-gray-900">Balance due</td>
                      <td className="px-6 py-2 text-right font-bold text-gray-900">{formatCurrency(invoice.total - invoice.amount_paid)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          )}
        </Card>

        {/* Recurring */}
        <RecurringInvoiceCard
          invoiceId={invoice.id}
          initial={{ isRecurring: !!invoice.is_recurring, rule: invoice.recurrence_rule ?? null, next: invoice.recurrence_next ?? null, end: invoice.recurrence_end ?? null }}
        />

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
    </>
  )
}
