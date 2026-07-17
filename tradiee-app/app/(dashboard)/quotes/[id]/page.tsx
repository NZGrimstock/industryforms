import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { nextDocNumber } from '@/lib/numbering'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { QuoteActions } from './client'
import { SaveTemplateButton } from './save-template'
import { PrevNextNav } from '@/components/ui/prev-next-nav'
import Link from 'next/link'

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, companies!company_id(name, default_gst_rate)').eq('id', user!.id).single()

  const [{ data: quote }, nextJobNumber, { data: quoteList }] = await Promise.all([
    supabase
      .from('quotes')
      .select('*, customers(*, customer_sites(*)), quote_sections(*, quote_line_items(*))')
      .eq('id', id)
      .eq('company_id', profile!.company_id)
      .single(),
    nextDocNumber(supabase, profile!.company_id, 'job'),
    supabase.from('quotes').select('id').eq('company_id', profile!.company_id).order('quote_number'),
  ])

  if (!quote) notFound()

  const quoteIdx = (quoteList ?? []).findIndex(q => q.id === id)
  const prevQuoteHref = quoteIdx > 0 ? `/quotes/${quoteList![quoteIdx - 1].id}` : null
  const nextQuoteHref = quoteIdx >= 0 && quoteIdx < (quoteList?.length ?? 0) - 1 ? `/quotes/${quoteList![quoteIdx + 1].id}` : null

  const sections = (quote.quote_sections ?? []).sort((a: {sort_order: number}, b: {sort_order: number}) => a.sort_order - b.sort_order)

  // Gross profit (internal): sell subtotal minus cost of all line items
  const allLines = sections.flatMap((s: { quote_line_items?: { quantity: number; unit_cost: number | null }[] }) => s.quote_line_items ?? [])
  const totalCost = allLines.reduce((sum: number, l: { quantity: number; unit_cost: number | null }) => sum + Number(l.quantity) * Number(l.unit_cost ?? 0), 0)
  const grossProfit = Number(quote.subtotal) - totalCost
  const margin = Number(quote.subtotal) > 0 ? (grossProfit / Number(quote.subtotal)) * 100 : 0

  return (
    <>
      <Header title={quote.quote_number} profile={profile} />
      <div className="p-6 space-y-6 max-w-5xl">
        {/* Header row */}
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{quote.title}</h2>
              <StatusBadge status={quote.status} />
            </div>
            <p className="text-sm text-gray-500">
              For{' '}
              <Link href={`/customers/${quote.customer_id}`} className="text-orange-500 hover:underline">
                {(quote.customers as {name: string})?.name}
              </Link>
              {quote.expires_at && <> · Expires {formatDate(quote.expires_at)}</>}
            </p>
            {quote.sent_at && <p className="text-xs text-gray-400 mt-1">Sent {formatDateTime(quote.sent_at)}{quote.viewed_at && ` · Viewed ${formatDateTime(quote.viewed_at)}`}</p>}
            {quote.converted_to_job_id && (
              <Link href={`/jobs/${quote.converted_to_job_id}`} className="text-xs text-green-600 hover:underline mt-1 block">
                ✓ Converted to job
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PrevNextNav prevHref={prevQuoteHref} nextHref={nextQuoteHref} />
            <SaveTemplateButton quoteId={quote.id} defaultName={quote.title} />
            <QuoteActions quote={quote} companyId={profile!.company_id} nextJobNumber={nextJobNumber} />
          </div>
        </div>

        {/* Line items */}
        <Card className="overflow-hidden">
          {sections.length === 0 && quote.status === 'draft' && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-gray-500 mb-3">No line items yet.</p>
              <Link href={`/quotes/${quote.id}/edit`} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg">
                Add items to quote →
              </Link>
            </div>
          )}
          {sections.map((s: {id: string; title: string; is_optional: boolean; sort_order: number; quote_line_items: {id: string; description: string; quantity: number; unit: string; unit_price: number; line_total: number; sort_order: number}[]}) => (
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
                      <td className="px-3 py-3 text-gray-500 text-right w-20">{l.quantity} {l.unit}</td>
                      <td className="px-3 py-3 text-gray-500 text-right w-28">{formatCurrency(l.unit_price)}</td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900 w-28">{formatCurrency(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-1.5 text-sm">
            <div className="flex justify-end gap-12 text-gray-600">
              <span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span>
            </div>
            {Number(quote.discount_amount) > 0 && (
              <div className="flex justify-end gap-12 text-green-600">
                <span>Discount{quote.discount_type === 'percent' ? ` (${Number(quote.discount_value)}%)` : ''}</span><span>−{formatCurrency(quote.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-end gap-12 text-gray-600">
              <span>GST</span><span>{formatCurrency(quote.gst_amount)}</span>
            </div>
            <div className="flex justify-end gap-12 font-semibold text-gray-900 text-base border-t border-gray-200 pt-2">
              <span>Total</span><span>{formatCurrency(quote.total)}</span>
            </div>
            <div className="flex justify-end gap-12 text-xs text-gray-400 pt-1">
              <span>Gross profit (internal)</span>
              <span className={grossProfit < 0 ? 'text-red-500' : 'text-green-600'}>{formatCurrency(grossProfit)} · {margin.toFixed(0)}%</span>
            </div>
          </div>
        </Card>

        {/* Notes */}
        {(quote.customer_message || quote.notes || quote.terms) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quote.customer_message && (
              <Card>
                <CardHeader><CardTitle>Message to customer</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.customer_message}</p></CardContent>
              </Card>
            )}
            {quote.notes && (
              <Card>
                <CardHeader><CardTitle>Internal notes</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p></CardContent>
              </Card>
            )}
            {quote.terms && (
              <Card className="md:col-span-2">
                <CardHeader><CardTitle>Terms & conditions</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.terms}</p></CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Public link */}
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Customer link</p>
              <p className="text-xs text-gray-400">Share this link with your customer to view and accept the quote</p>
            </div>
            <a href={`/q/${quote.public_token}`} target="_blank" className="text-sm text-orange-500 hover:underline">
              Open quote →
            </a>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
