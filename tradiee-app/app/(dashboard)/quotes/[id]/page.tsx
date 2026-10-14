import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { nextDocNumber } from '@/lib/numbering'
import { StatusBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateTime, quoteLabel } from '@/lib/utils'
import { orderQuoteSections } from '@/lib/quote-sections'
import { paperCompany } from '@/lib/paper-company'
import { Pencil } from 'lucide-react'
import {
  DocumentWorkspace, Paper, PaperHeader, PaperFields, PaperColumns, PaperBlock, PaperLines, PaperLinesHead,
  PaperLineRow, PaperSectionHeading, PaperTotals, PaperSignatures, PaperNotes, PaperFootnote, PaperLegend,
  InternalRail, RailCard, RailRow,
} from '@/components/documents/paper'
import { QuoteActions } from './client'
import { SaveTemplateButton } from './save-template'
import { PrevNextNav } from '@/components/ui/prev-next-nav'
import Link from 'next/link'
import { effectivePlanKey } from '@/lib/billing'
import { logoDataUri } from '@/lib/pdf-logo'
import type { QuotePdfData } from '@/components/pdf/quote-pdf'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, timezone, companies!company_id(name, email, phone, gst_number, logo_url, default_gst_rate, subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until)').eq('id', user!.id).single()
  const co = profile?.companies as unknown as {
    name: string; email: string | null; phone: string | null; gst_number: string | null; logo_url: string | null; default_gst_rate: number
    subscription_plan: string | null; subscription_status: string | null; trial_ends_at: string | null; billing_exempt: boolean | null; comp_plan: string | null; comp_until: string | null
  } | null
  const billingCompany = co

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

  type LineRow = { id: string; description: string; quantity: number; unit: string; unit_price: number; unit_cost: number | null; line_total: number; sort_order: number }
  const sections = orderQuoteSections((quote.quote_sections ?? []) as { title: string; is_optional: boolean; sort_order: number; quote_line_items: LineRow[] }[])

  // Gross profit (internal): sell subtotal minus cost of all line items
  const allLines = sections.flatMap(s => s.lines)
  const totalCost = allLines.reduce((sum: number, l: { quantity: number; unit_cost: number | null }) => sum + Number(l.quantity) * Number(l.unit_cost ?? 0), 0)
  const grossProfit = Number(quote.subtotal) - totalCost
  const margin = Number(quote.subtotal) > 0 ? (grossProfit / Number(quote.subtotal)) * 100 : 0

  const pdfLines = allLines
  const printData: QuotePdfData = {
    quote: {
      quote_number: quote.quote_number,
      is_estimate: quote.is_estimate,
      created_at: quote.created_at,
      expires_at: quote.expires_at,
      subtotal: quote.subtotal,
      discount_amount: quote.discount_amount,
      gst_amount: quote.gst_amount,
      total: quote.total,
      reference: quote.reference,
      customer_message: quote.customer_message,
      terms: quote.terms,
      customers: quote.customers,
      title: quote.title,
      lines: pdfLines,
      sections,
    },
    company: {
      name: co?.name ?? '',
      email: co?.email ?? null,
      phone: co?.phone ?? null,
      gst_number: co?.gst_number ?? null,
      logo_url: await logoDataUri(co?.logo_url),
      isFreePlan: effectivePlanKey(billingCompany) === 'free',
    },
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
  }

  const docWord = quoteLabel(quote.is_estimate)
  const isDraft = quote.status === 'draft'
  const isFreePlan = effectivePlanKey(billingCompany) === 'free'
  const customer = quote.customers as { name: string; email?: string | null; billing_address?: string | null } | null
  const preTax = Number(quote.subtotal) - Number(quote.discount_amount ?? 0)

  return (
    <>
      <Header title={quote.quote_number} profile={profile} />
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">
              <Link href="/quotes" className="hover:underline">{quoteLabel(quote.is_estimate, true)}</Link> / <b className="font-semibold text-gray-900">{quote.quote_number}</b>
            </span>
            <StatusBadge status={quote.status} />
            {quote.is_estimate && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-blue-700">Estimate</span>
            )}
            <span className="flex-1" />
            <PrevNextNav prevHref={prevQuoteHref} nextHref={nextQuoteHref} />
            <SaveTemplateButton quoteId={quote.id} defaultName={quote.title} />
            <QuoteActions quote={quote} companyId={profile!.company_id} nextJobNumber={nextJobNumber} isFreePlan={isFreePlan} printData={printData} />
          </div>
          <PaperLegend />

          <DocumentWorkspace>
            <Paper label={`${docWord} ${quote.quote_number}`}>
              {isDraft && (
                <Link
                  href={`/quotes/${quote.id}/edit`}
                  className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-orange-50 px-3 py-1.5 font-sans text-[13px] font-medium text-orange-800 ring-1 ring-orange-200 hover:bg-orange-100 print:hidden"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit on the page
                </Link>
              )}
              <PaperHeader company={paperCompany(co)} docLabel={docWord} docNumber={quote.quote_number} />
              <PaperFields
                fields={[
                  { label: `Date of ${docWord.toLowerCase()}`, value: formatDate(quote.created_at) },
                  { label: `${docWord} No.`, value: quote.quote_number },
                  { label: 'Valid until', value: quote.expires_at ? formatDate(quote.expires_at) : '—' },
                ]}
              />
              <PaperColumns>
                <PaperBlock title="Client">
                  <Link href={`/customers/${quote.customer_id}`} className="hover:underline">{customer?.name}</Link>
                  {customer?.billing_address ? <div className="whitespace-pre-wrap">{customer.billing_address}</div> : null}
                  {customer?.email ? <div>{customer.email}</div> : null}
                </PaperBlock>
                <PaperBlock title="Reference">{quote.reference ?? ''}</PaperBlock>
              </PaperColumns>
              {quote.title ? <h2 className="mb-3 text-base font-bold">{quote.title}</h2> : null}

              <PaperLines>
                <PaperLinesHead />
                {allLines.length === 0 && (
                  <div className="px-2 py-10 text-center font-sans">
                    <p className="mb-3 text-sm text-gray-500">No line items yet.</p>
                    {isDraft && (
                      <Link href={`/quotes/${quote.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent,#f97316)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover,#ea580c)]">
                        Add items to {docWord.toLowerCase()} →
                      </Link>
                    )}
                  </div>
                )}
                {sections.map((s, si) => (
                  <div key={si}>
                    {s.title ? <PaperSectionHeading optional={s.is_optional}>{s.title}</PaperSectionHeading> : null}
                    {s.lines.map(l => (
                      <PaperLineRow
                        key={l.id}
                        n={l.n}
                        description={l.description}
                        qty={`${l.quantity} ${l.unit}`}
                        price={formatCurrency(l.unit_price)}
                        total={formatCurrency(l.line_total)}
                      />
                    ))}
                  </div>
                ))}
              </PaperLines>

              <PaperTotals
                rows={[
                  { label: 'Total before discount', value: formatCurrency(quote.subtotal) },
                  ...(Number(quote.discount_amount) > 0
                    ? [
                        { label: `Total discount${quote.discount_type === 'percent' ? ` (${Number(quote.discount_value)}%)` : ''}`, value: `-${formatCurrency(quote.discount_amount)}` },
                        { label: 'Total before tax', value: formatCurrency(preTax) },
                      ]
                    : []),
                  { label: 'Total tax', value: formatCurrency(quote.gst_amount) },
                ]}
                grand={{ label: 'Total', value: formatCurrency(quote.total) }}
              />

              <PaperSignatures
                left="Customer signature"
                right="Authorised signature"
                leftContent={quote.signature_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={quote.signature_url} alt={`Signature of ${quote.signed_by_name ?? 'customer'}`} className="mb-1 h-12 w-auto" />
                    <div className="mb-0.5 text-gray-800">{quote.signed_by_name}</div>
                  </>
                ) : undefined}
              />

              <PaperNotes
                blocks={[
                  ...(quote.customer_message ? [{ title: 'Message', content: quote.customer_message }] : []),
                  { title: 'Terms & conditions', content: quote.terms ?? `This ${docWord.toLowerCase()} is valid until the date shown above. Prices may change after this date.` },
                ]}
              />
              <PaperFootnote show={isFreePlan} />
            </Paper>

            <InternalRail label={`Internal — not on the ${docWord.toLowerCase()}`}>
              <RailCard title={`Profit on this ${docWord.toLowerCase()}`}>
                <div className={grossProfit < 0 ? 'text-[26px] font-bold text-red-600' : 'text-[26px] font-bold text-gray-900'}>
                  {Number(quote.subtotal) > 0 ? `${margin.toFixed(0)}%` : '—'}
                </div>
                <p className="mb-2 text-[13px] text-gray-600">gross margin</p>
                <RailRow label="Sell (ex GST)" value={formatCurrency(quote.subtotal)} />
                <RailRow label="Your cost" value={formatCurrency(totalCost)} />
                <RailRow label="Gross profit" value={formatCurrency(grossProfit)} />
              </RailCard>

              <RailCard title="Activity">
                <RailRow label="Created" value={formatDateTime(quote.created_at)} />
                {quote.sent_at && <RailRow label="Sent" value={formatDateTime(quote.sent_at)} />}
                {quote.viewed_at && <RailRow label="Viewed" value={formatDateTime(quote.viewed_at)} />}
                {quote.signed_at && <RailRow label={`Signed by ${quote.signed_by_name ?? 'customer'}`} value={formatDateTime(quote.signed_at)} />}
                {quote.accepted_at && <RailRow label="Accepted" value={formatDateTime(quote.accepted_at)} />}
                {quote.declined_at && <RailRow label="Declined" value={formatDateTime(quote.declined_at)} />}
                {!quote.sent_at && isDraft && <p className="pt-1 text-[13px] text-gray-600">Not sent yet.</p>}
                {quote.converted_to_job_id && (
                  <Link href={`/jobs/${quote.converted_to_job_id}`} className="mt-1 block text-sm font-medium text-green-700 hover:underline">✓ Converted to job →</Link>
                )}
              </RailCard>

              {quote.notes && (
                <RailCard title="Internal notes">
                  <p className="whitespace-pre-wrap text-[13px] leading-normal text-gray-700">{quote.notes}</p>
                </RailCard>
              )}

              <RailCard title="Customer link">
                <p className="mb-2 text-[13px] text-gray-600">Share this link so the customer can view and accept the {docWord.toLowerCase()} online.</p>
                <a href={`/q/${quote.public_token}`} target="_blank" className="text-sm font-medium text-orange-700 hover:underline">
                  Open {docWord.toLowerCase()} →
                </a>
              </RailCard>
            </InternalRail>
          </DocumentWorkspace>
        </div>
      </div>
    </>
  )
}
