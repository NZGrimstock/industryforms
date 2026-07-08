import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, calcDurationHours, formatDate } from '@/lib/utils'
import { PrintReportsButton } from './print-button'

const PERIODS = [
  { value: '1m', label: '1 month', months: 1 },
  { value: '3m', label: '3 months', months: 3 },
  { value: '6m', label: '6 months', months: 6 },
  { value: '1y', label: '1 year', months: 12 },
  { value: '2y', label: '2 years', months: 24 },
  { value: '5y', label: '5 years', months: 60 },
  { value: 'all', label: 'All time', months: null },
] as const

type PeriodValue = typeof PERIODS[number]['value']

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ period?: string; status?: string }> }) {
  const params = await searchParams
  const period = (PERIODS.some(p => p.value === params?.period) ? params?.period : '6m') as PeriodValue
  const selectedPeriod = PERIODS.find(p => p.value === period) ?? PERIODS[2]
  const statusFilter = params?.status ?? ''
  const now = new Date()
  const start = selectedPeriod.months === null ? null : new Date(now.getFullYear(), now.getMonth() - selectedPeriod.months + 1, 1)
  const previousStart = selectedPeriod.months === null ? null : new Date(start!.getFullYear(), start!.getMonth() - selectedPeriod.months, 1)
  const previousEnd = start ? new Date(start.getTime() - 1) : null
  const periodLabel = start ? `${formatDate(start.toISOString())} to ${formatDate(now.toISOString())}` : 'All recorded data'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()
  const companyId = profile!.company_id

  let invoicesQuery = supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, created_at, customer_id, customers(name)').eq('company_id', companyId).order('created_at', { ascending: false })
  let timesheetsQuery = supabase.from('timesheets').select('started_at, ended_at, break_minutes, bill_rate, cost_rate, is_billable').eq('company_id', companyId)
  let quotesQuery = supabase.from('quotes').select('id, quote_number, status, total, created_at, customers(name)').eq('company_id', companyId).order('created_at', { ascending: false })
  let jobsQuery = supabase.from('jobs').select('id, job_number, title, status, created_at, customers(name)').eq('company_id', companyId).order('created_at', { ascending: false })
  if (start) {
    invoicesQuery = invoicesQuery.gte('created_at', start.toISOString())
    timesheetsQuery = timesheetsQuery.gte('started_at', start.toISOString())
    quotesQuery = quotesQuery.gte('created_at', start.toISOString())
    jobsQuery = jobsQuery.gte('created_at', start.toISOString())
  }
  if (statusFilter) jobsQuery = jobsQuery.eq('status', statusFilter)

  const [invoicesRes, previousInvoicesRes, timesheetsRes, quotesRes, jobsRes, priceItemsRes] = await Promise.all([
    invoicesQuery,
    previousStart && previousEnd
      ? supabase.from('invoices').select('status, total, amount_paid, created_at').eq('company_id', companyId).gte('created_at', previousStart.toISOString()).lte('created_at', previousEnd.toISOString())
      : Promise.resolve({ data: [] }),
    timesheetsQuery,
    quotesQuery,
    jobsQuery,
    supabase.from('price_list_items').select('quantity_on_hand, low_stock_threshold, name, unit').eq('company_id', companyId).not('quantity_on_hand', 'is', null),
  ])

  const invoices = invoicesRes.data ?? []
  const previousInvoices = previousInvoicesRes.data ?? []
  const timesheets = timesheetsRes.data ?? []
  const quotes = quotesRes.data ?? []
  const jobs = jobsRes.data ?? []
  const stockItems = priceItemsRes.data ?? []

  const paidInvoices = invoices.filter(i => i.status === 'paid')
  const revenue = paidInvoices.reduce((sum, i) => sum + Number(i.total), 0)
  const previousRevenue = previousInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0)
  const outstanding = invoices.filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status)).reduce((sum, i) => sum + (Number(i.total) - Number(i.amount_paid)), 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + (Number(i.total) - Number(i.amount_paid)), 0)
  const sentQuotes = quotes.filter(q => q.status !== 'draft').length
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length
  const conversionRate = sentQuotes > 0 ? Math.round((acceptedQuotes / sentQuotes) * 100) : 0
  const labourHours = timesheets.filter(t => t.ended_at).reduce((sum, t) => sum + calcDurationHours(t.started_at, t.ended_at!, t.break_minutes), 0)
  const billableHours = timesheets.filter(t => t.ended_at && t.is_billable).reduce((sum, t) => sum + calcDurationHours(t.started_at, t.ended_at!, t.break_minutes), 0)
  const labourRevenue = timesheets.filter(t => t.ended_at && t.is_billable && t.bill_rate).reduce((sum, t) => sum + calcDurationHours(t.started_at, t.ended_at!, t.break_minutes) * Number(t.bill_rate), 0)
  const lowStock = stockItems.filter(i => i.low_stock_threshold !== null && i.quantity_on_hand! <= i.low_stock_threshold!)
  const jobStatusCounts = jobs.reduce((acc: Record<string, number>, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})
  const maxStatusCount = Math.max(1, ...Object.values(jobStatusCounts))

  return (
    <>
      <Header title="Reports" profile={profile} />
      <div className="p-6 space-y-6 report-page">
        <div className="flex flex-wrap items-start justify-between gap-3 print-hidden">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Business reports</h2>
            <p className="text-sm text-gray-500">Period: {periodLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <form className="flex items-center gap-2" action="/reports">
              <select name="period" defaultValue={period} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Apply</button>
            </form>
            <PrintReportsButton />
          </div>
        </div>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Summary ({selectedPeriod.label})</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Revenue" value={formatCurrency(revenue)} sub={selectedPeriod.months ? `Previous period: ${formatCurrency(previousRevenue)}` : undefined} />
            <StatCard label="Outstanding" value={formatCurrency(outstanding)} sub={`Overdue: ${formatCurrency(overdue)}`} alert={overdue > 0} />
            <StatCard label="Quote conversion" value={`${conversionRate}%`} sub={`${acceptedQuotes} / ${sentQuotes} sent`} />
            <StatCard label="Jobs created" value={String(jobs.length)} sub={statusFilter ? `Filtered: ${statusFilter.replace(/_/g, ' ')}` : 'All statuses'} />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Labour ({selectedPeriod.label})</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total hours" value={`${labourHours.toFixed(1)}h`} />
            <StatCard label="Billable hours" value={`${billableHours.toFixed(1)}h`} sub={labourHours > 0 ? `${Math.round((billableHours / labourHours) * 100)}% utilisation` : undefined} />
            <StatCard label="Labour revenue" value={formatCurrency(labourRevenue)} />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Jobs by status ({selectedPeriod.label})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(jobStatusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <Link key={status} href={`/reports?period=${period}&status=${status}`} className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-gray-50">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-600 capitalize w-28">{status.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-orange-400 h-2 rounded-full" style={{ width: `${(count / maxStatusCount) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                </Link>
              ))}
              {jobs.length === 0 && <p className="text-sm text-gray-400">No jobs in this period</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Low stock alerts</CardTitle></CardHeader>
            <CardContent className="p-0">
              {lowStock.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 py-4">All stock levels OK</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {lowStock.map(item => (
                    <li key={item.name} className="px-6 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-700">{item.name}</span>
                      <span className="text-sm text-[var(--accent,#f97316)] font-medium">{item.quantity_on_hand} {item.unit} remaining</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DrillTable title={`Revenue drill-down (${paidInvoices.length})`} rows={paidInvoices.slice(0, 12).map(i => ({
            href: `/invoices/${i.id}`,
            primary: i.invoice_number,
            secondary: customerName(i.customers),
            amount: formatCurrency(Number(i.total)),
            date: formatDate(i.created_at),
          }))} empty="No paid invoices in this period" />
          <DrillTable title={`Job drill-down (${jobs.length})`} rows={jobs.slice(0, 12).map(j => ({
            href: `/jobs/${j.id}`,
            primary: `${j.job_number} - ${j.title}`,
            secondary: `${j.status.replace(/_/g, ' ')} · ${customerName(j.customers)}`,
            amount: '',
            date: formatDate(j.created_at),
          }))} empty="No jobs in this period" />
        </div>
      </div>
    </>
  )
}

function customerName(value: unknown) {
  const customer = Array.isArray(value) ? value[0] : value
  return (customer as { name?: string } | null)?.name ?? 'No customer'
}

function DrillTable({ title, rows, empty }: { title: string; rows: Array<{ href: string; primary: string; secondary: string; amount: string; date: string }>; empty: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">{empty}</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {rows.map(row => (
              <li key={row.href}>
                <Link href={row.href} className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{row.primary}</p>
                    <p className="truncate text-xs text-gray-400">{row.secondary}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {row.amount && <p className="text-sm font-medium text-gray-900">{row.amount}</p>}
                    <p className="text-xs text-gray-400">{row.date}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}
