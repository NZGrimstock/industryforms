import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import { approvedVariationTotal } from '@/lib/job-financials'
import { PublicVariationActions } from './client'
import { Wrench } from 'lucide-react'

type Item = { id: string; description: string; quantity: number; unit: string; line_total: number; sort_order: number }

export default async function PublicVariationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  // Service role — the customer has no auth.uid(), same as the public quote page.
  const { data: variation } = await supabase
    .from('variations')
    .select('*, variation_items(*), companies(name, email, phone, logo_url), jobs(id, job_number, title, quote_id, customers(name))')
    .eq('public_token', token)
    .single()

  if (!variation) notFound()

  if (!variation.viewed_at) {
    await supabase.from('variations').update({ viewed_at: new Date().toISOString() }).eq('id', variation.id)
  }

  const company = variation.companies as unknown as { name: string; email: string | null; phone: string | null; logo_url: string | null }
  const job = variation.jobs as unknown as { id: string; job_number: string; title: string; quote_id: string | null; customers: { name: string } | null } | null

  // The whole point of showing this to a customer: what the job was, and what
  // it becomes if they agree. Original contract sum + every variation already
  // approved = the price as it stands today; this one is the change on top.
  let originalTotal = 0
  if (job?.quote_id) {
    const { data: quote } = await supabase.from('quotes').select('total').eq('id', job.quote_id).single()
    originalTotal = Number(quote?.total ?? 0)
  }
  const { data: siblings } = await supabase
    .from('variations')
    .select('id, status, total')
    .eq('job_id', variation.job_id)
  const priorApproved = approvedVariationTotal(
    (siblings ?? [])
      .filter(v => v.id !== variation.id)
      .map(v => ({ status: v.status, amount: v.total })),
  )

  const currentPrice = originalTotal + priorApproved
  const revisedPrice = currentPrice + Number(variation.total)
  const items = [...((variation.variation_items ?? []) as Item[])].sort((a, b) => a.sort_order - b.sort_order)
  const canRespond = ['draft', 'sent'].includes(variation.status)

  return (
    <div className="min-h-screen bg-gray-50">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
                Variation · {variation.variation_number}
              </p>
              <h1 className="text-xl font-bold text-gray-900">{variation.title}</h1>
            </div>
            {variation.sent_at && (
              <p className="text-sm text-gray-500 shrink-0">{formatDate(variation.sent_at)}</p>
            )}
          </div>
          <div className="text-sm text-gray-600 space-y-0.5">
            {job?.customers?.name && <p><strong>Prepared for:</strong> {job.customers.name}</p>}
            {job && <p><strong>Job:</strong> {job.job_number} — {job.title}</p>}
          </div>
          {variation.description && (
            <p className="mt-4 text-sm text-gray-600 bg-orange-50 rounded-lg p-3 border border-orange-100 whitespace-pre-wrap">
              {variation.description}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Additional work</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {items.map(l => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3 text-gray-700">{l.description}</td>
                  <td className="px-3 py-3 text-gray-500 text-right w-24">{l.quantity} {l.unit}</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900 w-28">{formatCurrency(l.line_total)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td className="px-6 py-4 text-gray-400">No items listed.</td></tr>
              )}
            </tbody>
          </table>
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-1.5 text-sm">
            <div className="flex justify-end gap-16 text-gray-600">
              <span>Subtotal</span><span>{formatCurrency(variation.subtotal)}</span>
            </div>
            <div className="flex justify-end gap-16 text-gray-600">
              <span>GST</span><span>{formatCurrency(variation.gst_amount)}</span>
            </div>
            <div className="flex justify-end gap-16 font-bold text-gray-900 text-lg border-t border-gray-200 pt-2">
              <span>This variation</span><span>{formatCurrency(variation.total)}</span>
            </div>
          </div>
        </div>

        {/* Old price → new price. The reason this document exists. */}
        {currentPrice > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">What this changes</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Agreed price before this variation</span>
                <span>{formatCurrency(currentPrice)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>This variation</span>
                <span className="text-orange-600">+{formatCurrency(variation.total)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-2 mt-1">
                <span>Revised price if approved</span>
                <span>{formatCurrency(revisedPrice)}</span>
              </div>
            </div>
          </div>
        )}

        {canRespond && <PublicVariationActions token={token} />}

        {variation.status === 'approved' && (
          <div className="text-center py-6 text-green-600 font-semibold">
            ✓ This variation was approved{variation.signed_by_name ? ` by ${variation.signed_by_name}` : ''}
            {variation.approved_at ? ` on ${formatDate(variation.approved_at)}` : ''}.
          </div>
        )}
        {variation.status === 'declined' && (
          <div className="text-center py-6 text-gray-500">This variation was declined.</div>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">Powered by IndustryForms</p>
      </div>
    </div>
  )
}
