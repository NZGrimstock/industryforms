import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Wrench } from 'lucide-react'
import { PayNowButton } from './pay-button'

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, customers(name, email, billing_address), companies(name, email, phone, gst_number, logo_url), jobs(job_number, title), invoice_line_items(*)')
    .eq('public_token', token)
    .single()

  if (!invoice) notFound()

  if (!invoice.viewed_at) {
    await supabase.from('invoices').update({ viewed_at: new Date().toISOString() }).eq('id', invoice.id)
  }

  const company = invoice.companies as { name: string; email: string | null; phone: string | null; gst_number: string | null }
  const customer = invoice.customers as { name: string; email: string | null; billing_address: string | null }
  const lines = [...(invoice.invoice_line_items ?? [])].sort((a: {sort_order: number}, b: {sort_order: number}) => a.sort_order - b.sort_order)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <Wrench className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">{company.name}</span>
          </div>
          <div className="text-right text-xs text-gray-400">
            {company.email && <p>{company.email}</p>}
            {company.phone && <p>{company.phone}</p>}
            {company.gst_number && <p>GST: {company.gst_number}</p>}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">TAX INVOICE</p>
              <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
            </div>
            <div className="text-right text-sm">
              <p className={`font-semibold text-lg ${invoice.status === 'paid' ? 'text-green-600' : invoice.status === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                {invoice.status === 'paid' ? 'PAID' : invoice.status === 'overdue' ? 'OVERDUE' : invoice.status.toUpperCase()}
              </p>
              {invoice.due_date && <p className="text-gray-500 text-xs">Due {formatDate(invoice.due_date)}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill to</p>
              <p className="text-gray-900 font-medium">{customer.name}</p>
              {customer.billing_address && <p className="text-gray-500">{customer.billing_address}</p>}
            </div>
            {invoice.jobs && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">For</p>
                <p className="text-gray-700">{(invoice.jobs as {title: string}).title}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
                <th className="text-left px-6 py-3 font-medium">Description</th>
                <th className="text-right px-3 py-3 font-medium w-20">Qty</th>
                <th className="text-right px-3 py-3 font-medium w-28">Unit price</th>
                <th className="text-right px-6 py-3 font-medium w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3 text-gray-700">{l.description}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{l.quantity} {l.unit}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(l.unit_price)}</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr><td colSpan={3} className="px-6 py-2 text-right text-sm text-gray-600">Subtotal</td><td className="px-6 py-2 text-right text-sm text-gray-900 font-medium">{formatCurrency(invoice.subtotal)}</td></tr>
              {Number(invoice.discount_amount) > 0 && <tr><td colSpan={3} className="px-6 py-2 text-right text-sm text-green-600">Discount{invoice.discount_type === 'percent' ? ` (${Number(invoice.discount_value)}%)` : ''}</td><td className="px-6 py-2 text-right text-sm font-medium text-green-600">−{formatCurrency(invoice.discount_amount)}</td></tr>}
              <tr><td colSpan={3} className="px-6 py-2 text-right text-sm text-gray-600">GST</td><td className="px-6 py-2 text-right text-sm text-gray-900 font-medium">{formatCurrency(invoice.gst_amount)}</td></tr>
              <tr className="border-t border-gray-200"><td colSpan={3} className="px-6 py-3 text-right font-semibold text-gray-900">Total</td><td className="px-6 py-3 text-right font-bold text-xl text-gray-900">{formatCurrency(invoice.total)}</td></tr>
              {invoice.amount_paid > 0 && <tr><td colSpan={3} className="px-6 py-2 text-right text-sm text-green-600">Paid</td><td className="px-6 py-2 text-right text-sm font-medium text-green-600">-{formatCurrency(invoice.amount_paid)}</td></tr>}
              {invoice.total - invoice.amount_paid > 0 && <tr><td colSpan={3} className="px-6 py-3 text-right font-semibold text-gray-900">Balance due</td><td className="px-6 py-3 text-right font-bold text-gray-900">{formatCurrency(invoice.total - invoice.amount_paid)}</td></tr>}
            </tfoot>
          </table>
        </div>

        {invoice.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {invoice.terms && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Terms</p>
            <p className="text-sm text-gray-500 whitespace-pre-wrap">{invoice.terms}</p>
          </div>
        )}

        {['sent', 'partially_paid', 'overdue'].includes(invoice.status) && (invoice.total - invoice.amount_paid) > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">Ready to pay?</p>
                <p className="text-xs text-gray-400 mt-0.5">Secure payment powered by Stripe</p>
              </div>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(invoice.total - invoice.amount_paid)}</p>
            </div>
            <PayNowButton token={invoice.public_token} amountDue={invoice.total - invoice.amount_paid} />
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">Powered by IndustryForms</p>
      </div>
    </div>
  )
}
