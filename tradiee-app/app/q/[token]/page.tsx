import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PublicQuoteActions } from './client'
import { Wrench } from 'lucide-react'

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  // Fetch via service role — customer has no auth.uid(), so we bypass RLS here
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, customers(name, email, phone), customer_sites(label, address), companies(name, email, phone, logo_url, gst_number, quote_footer), quote_sections(*, quote_line_items(*))')
    .eq('public_token', token)
    .single()

  if (!quote) notFound()

  // Track view time
  if (!quote.viewed_at) {
    await supabase.from('quotes').update({ viewed_at: new Date().toISOString() }).eq('id', quote.id)
  }

  const company = quote.companies as { name: string; email: string | null; phone: string | null; logo_url: string | null; gst_number: string | null; quote_footer: string | null }
  const customer = quote.customers as { name: string; email: string | null }
  const sections = [...(quote.quote_sections ?? [])].sort((a: {sort_order: number}, b: {sort_order: number}) => a.sort_order - b.sort_order)
  const canRespond = ['sent', 'draft'].includes(quote.status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.name} className="h-7 w-auto object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="font-semibold text-gray-900">{company.name}</span>
          </div>
          <div className="text-right text-xs text-gray-400">
            {company.email && <p>{company.email}</p>}
            {company.phone && <p>{company.phone}</p>}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Quote header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{quote.quote_number}</p>
              <h1 className="text-xl font-bold text-gray-900">{quote.title}</h1>
            </div>
            <div className="text-right text-sm text-gray-500">
              {quote.expires_at && <p>Expires {formatDate(quote.expires_at)}</p>}
            </div>
          </div>
          <div className="text-sm text-gray-600 space-y-0.5">
            <p><strong>Prepared for:</strong> {customer.name}</p>
            {(quote.customer_sites as {label: string | null; address: string} | null)?.address && (
              <p><strong>Site:</strong> {(quote.customer_sites as {label: string | null; address: string}).label ? `${(quote.customer_sites as {label: string; address: string}).label} — ` : ''}{(quote.customer_sites as {label: string | null; address: string}).address}</p>
            )}
          </div>
          {quote.customer_message && (
            <p className="mt-4 text-sm text-gray-600 bg-orange-50 rounded-lg p-3 border border-orange-100">{quote.customer_message}</p>
          )}
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {sections.map((s: {id: string; title: string; is_optional: boolean; customer_selected: boolean | null; quote_line_items: {id: string; description: string; quantity: number; unit: string; unit_price: number; line_total: number; sort_order: number}[]}) => (
            <div key={s.id}>
              <div className="px-6 py-3 bg-gray-50 border-y border-gray-100 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">{s.title}</span>
                {s.is_optional && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Optional</span>}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {[...s.quote_line_items].sort((a, b) => a.sort_order - b.sort_order).map(l => (
                    <tr key={l.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-700">{l.description}</td>
                      <td className="px-3 py-3 text-gray-500 text-right w-24">{l.quantity} {l.unit}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900 w-28">{formatCurrency(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-1.5 text-sm">
            <div className="flex justify-end gap-16 text-gray-600">
              <span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span>
            </div>
            {Number(quote.discount_amount) > 0 && (
              <div className="flex justify-end gap-16 text-green-600">
                <span>Discount{quote.discount_type === 'percent' ? ` (${Number(quote.discount_value)}%)` : ''}</span>
                <span>−{formatCurrency(quote.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-end gap-16 text-gray-600">
              <span>GST</span><span>{formatCurrency(quote.gst_amount)}</span>
            </div>
            <div className="flex justify-end gap-16 font-bold text-gray-900 text-lg border-t border-gray-200 pt-2">
              <span>Total</span><span>{formatCurrency(quote.total)}</span>
            </div>
          </div>
        </div>

        {quote.terms && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Terms & conditions</h2>
            <p className="text-sm text-gray-500 whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}

        {/* Actions */}
        {canRespond && <PublicQuoteActions quoteId={quote.id} token={token} status={quote.status} />}

        {quote.status === 'accepted' && (
          <div className="text-center py-6 text-green-600 font-semibold">✓ This quote has been accepted. We&apos;ll be in touch shortly.</div>
        )}
        {quote.status === 'declined' && (
          <div className="text-center py-6 text-gray-500">This quote was declined.</div>
        )}

        {company.quote_footer && <p className="text-center text-sm text-gray-500 whitespace-pre-wrap">{company.quote_footer}</p>}
        <p className="text-center text-xs text-gray-300 pb-4">Powered by IndustryForms</p>
      </div>
    </div>
  )
}
