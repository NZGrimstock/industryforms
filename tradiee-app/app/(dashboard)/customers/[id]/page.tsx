import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils'
import { FinancialStatBox, type FinancialStat } from '@/components/ui/financial-stat-box'
import { summarizeInvoices, jobTotal, toInvoice, approvedVariationTotal } from '@/lib/job-financials'
import { round2, lineNet } from '@/lib/pricing'
import { currentFinancialYearStart } from '@/lib/financial-year'
import Link from 'next/link'
import { CustomerDetailClient } from './client'
import { SmsThread } from '@/components/customers/sms-thread'
import { smsConfigured } from '@/lib/sms'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name, role, timezone, companies!company_id(country, default_gst_rate, prices_include_tax)')
    .eq('id', user!.id)
    .single()

  const { data: customer } = await supabase
    .from('customers')
    .select('*, customer_sites(*)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (!customer) notFound()

  const company = profile!.companies as unknown as { country: string | null; default_gst_rate: number | null; prices_include_tax?: boolean | null } | null
  const currency = company?.country === 'AU' ? 'AUD' : 'NZD'
  const gstRate = company?.default_gst_rate ?? 0.15
  const pricesIncludeTax = !!company?.prices_include_tax

  const [quotesRes, jobsRes, allInvoicesRes, commsRes, messagesRes, pricingGroupsRes] = await Promise.all([
    supabase.from('quotes').select('id, quote_number, status, total, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(10),
    // quote_id + linked quote total needed to work out each job's "to invoice"
    // ceiling — see lib/job-financials.ts. Not limited to 10: this feeds the
    // stat box, not just the visible list.
    supabase.from('jobs').select('id, job_number, title, status, created_at, quote_id, quotes(total)').eq('customer_id', id).order('created_at', { ascending: false }),
    // Also unlimited — the stat box needs the customer's full invoice history,
    // not just the 10 most recent shown in the card below.
    supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, due_date, job_id, created_at').eq('customer_id', id).order('created_at', { ascending: false }),
    supabase.from('communications').select('id, channel, direction, subject, summary, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('customer_messages').select('id, direction, body, created_at, delivery_status').eq('customer_id', id).order('created_at', { ascending: true }).limit(200),
    supabase.from('customer_groups').select('id, name').eq('company_id', profile!.company_id).order('name'),
  ])

  const allInvoices = allInvoicesRes.data ?? []
  const allJobs = jobsRes.data ?? []
  // Both re-sliced to 10 for their display cards below — the unlimited fetch
  // above is only for the financial stat box's totals, not the visible lists.
  const invoicesRes = { data: allInvoices.slice(0, 10) }
  const jobsForDisplay = allJobs.slice(0, 10)

  const { invoiced, paid, outstanding } = summarizeInvoices(allInvoices)

  // A quote-less job's total comes from its own logged materials + billable
  // labour instead — mirrors jobs/[id]/page.tsx's fallback (same reasoning:
  // "to invoice" must come from the job, not require a quote). Only fetched
  // for quote-less jobs since quoted jobs already have a real total.
  const quotelessJobIds = allJobs.filter(j => !j.quote_id).map(j => j.id)
  const [materialsRes, timesheetsRes] = quotelessJobIds.length > 0
    ? await Promise.all([
        supabase.from('job_materials').select('job_id, quantity, unit_price').in('job_id', quotelessJobIds),
        supabase.from('timesheets').select('job_id, started_at, ended_at, break_minutes, bill_rate, is_billable').in('job_id', quotelessJobIds),
      ])
    : [{ data: [] }, { data: [] }]
  // Net of GST when prices_include_tax is on — same fix as jobs/[id]/page.tsx's
  // actualTotal, see its comment for why lineNet() is needed here.
  const actualTotalByJob = new Map<string, number>()
  for (const m of materialsRes.data ?? []) {
    if (Number(m.unit_price) <= 0) continue
    actualTotalByJob.set(m.job_id, (actualTotalByJob.get(m.job_id) ?? 0) + lineNet(Number(m.quantity), Number(m.unit_price), null, 0, gstRate, pricesIncludeTax))
  }
  for (const t of timesheetsRes.data ?? []) {
    if (!t.is_billable || !t.bill_rate || !t.ended_at) continue
    const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000 - Number(t.break_minutes ?? 0) / 60
    if (hrs <= 0) continue
    actualTotalByJob.set(t.job_id, (actualTotalByJob.get(t.job_id) ?? 0) + lineNet(hrs, Number(t.bill_rate), null, 0, gstRate, pricesIncludeTax))
  }

  // "To invoice" per job needs that job's own invoices, so group first.
  const invoicedByJob = new Map<string, number>()
  for (const inv of allInvoices) {
    if (inv.status === 'void' || !inv.job_id) continue
    invoicedByJob.set(inv.job_id, (invoicedByJob.get(inv.job_id) ?? 0) + Number(inv.total))
  }

  // Extra work the customer has approved is still owed, so it belongs in this
  // stat. Tax-inclusive totals, matching invoice.total above.
  const variationsByJob = new Map<string, { status: string; amount: number }[]>()
  if (allJobs.length > 0) {
    const { data: variationRows } = await supabase
      .from('variations')
      .select('job_id, status, total')
      .in('job_id', allJobs.map(j => j.id))
    for (const v of variationRows ?? []) {
      const list = variationsByJob.get(v.job_id) ?? []
      list.push({ status: v.status, amount: Number(v.total) })
      variationsByJob.set(v.job_id, list)
    }
  }
  const toInvoiceTotal = allJobs.reduce((sum, j) => {
    const quote = j.quotes as unknown as { total: number } | null
    const jobInvoiced = invoicedByJob.get(j.id) ?? 0
    const jobSourcedCeiling = quote ? undefined : (() => {
      const actualTotal = actualTotalByJob.get(j.id) ?? 0
      return actualTotal > 0 ? round2(actualTotal * (1 + gstRate)) : undefined
    })()
    const jobVariations = approvedVariationTotal(variationsByJob.get(j.id) ?? [])
    return sum + toInvoice(jobTotal(quote?.total ?? jobSourcedCeiling, jobInvoiced, jobVariations), jobInvoiced)
  }, 0)

  const fyStart = currentFinancialYearStart(new Date(), company?.country, profile!.timezone)
  const fytdInvoiced = allInvoices
    .filter(i => i.status !== 'void' && new Date(i.created_at) >= fyStart)
    .reduce((sum, i) => sum + Number(i.total), 0)

  const stats: FinancialStat[] = [
    { label: 'To invoice', value: toInvoiceTotal },
    { label: 'Invoiced', value: invoiced },
    { label: 'Paid', value: paid, accent: 'good' },
    { label: 'Outstanding', value: outstanding, accent: outstanding > 0 ? 'warn' : 'neutral' },
    { label: 'Total FYTD', value: fytdInvoiced },
  ]

  return (
    <>
      <Header title={customer.name} profile={profile} />
      <div className="p-6 space-y-6">
        <FinancialStatBox stats={stats} currency={currency} />
        <CustomerDetailClient customer={customer} companyId={profile!.company_id} pricingGroups={pricingGroupsRes.data ?? []} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quotes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Quotes</CardTitle>
                <Link href={`/quotes/new?customerId=${id}`} className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">+ New</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(quotesRes.data ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No quotes</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {(quotesRes.data ?? []).map(q => (
                    <li key={q.id}>
                      <Link href={`/quotes/${q.id}`} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 text-sm">
                        <span className="text-gray-700">{q.quote_number}</span>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={q.status} />
                          <span className="text-gray-500">{formatCurrency(q.total)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Jobs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Jobs</CardTitle>
                <Link href={`/jobs/new?customerId=${id}`} className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">+ New</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {jobsForDisplay.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No jobs</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {jobsForDisplay.map(j => (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 text-sm">
                        <div>
                          <p className="text-gray-700">{j.job_number}</p>
                          <p className="text-xs text-gray-400 truncate">{j.title}</p>
                        </div>
                        <StatusBadge status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Invoices</CardTitle>
                <Link href={`/invoices/new?customerId=${id}`} className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">+ New</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(invoicesRes.data ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No invoices</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {(invoicesRes.data ?? []).map(i => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 text-sm">
                        <div>
                          <p className="text-gray-700">{i.invoice_number}</p>
                          {i.due_date && <p className="text-xs text-gray-400">Due {formatDate(i.due_date)}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={i.status} />
                          <span className="text-gray-500">{formatCurrency(i.total)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SMS thread (owner/admin only — RLS already enforces) */}
        {(profile?.role === 'owner' || profile?.role === 'admin') && (
          <Card>
            <CardHeader><CardTitle>Text messages</CardTitle></CardHeader>
            <CardContent>
              <SmsThread
                customerId={id}
                customerPhone={customer.phone ?? null}
                initial={(messagesRes.data ?? []) as { id: string; direction: 'inbound' | 'outbound'; body: string; created_at: string; delivery_status: string | null }[]}
                twilioLive={smsConfigured()}
              />
            </CardContent>
          </Card>
        )}

        {/* Communications history */}
        <Card>
          <CardHeader><CardTitle>Communications</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(commsRes.data ?? []).length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-400">No emails or texts logged yet.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {(commsRes.data ?? []).map((c: { id: string; channel: string; direction: string; subject: string | null; summary: string | null; created_at: string }) => (
                  <li key={c.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${c.channel === 'sms' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{c.channel}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 truncate">{c.subject ?? c.summary}</p>
                      {c.subject && c.summary && <p className="text-xs text-gray-400 truncate">{c.summary}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDateTime(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
