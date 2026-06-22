import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, calcDurationHours } from '@/lib/utils'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()
  const companyId = profile!.company_id

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

  const [invoicesRes, timesheetsRes, quotesRes, jobsRes, priceItemsRes] = await Promise.all([
    supabase.from('invoices').select('status, total, amount_paid, created_at').eq('company_id', companyId),
    supabase.from('timesheets').select('started_at, ended_at, break_minutes, bill_rate, cost_rate, is_billable').eq('company_id', companyId),
    supabase.from('quotes').select('status, total, created_at').eq('company_id', companyId),
    supabase.from('jobs').select('status').eq('company_id', companyId),
    supabase.from('price_list_items').select('quantity_on_hand, low_stock_threshold, name, unit').eq('company_id', companyId).not('quantity_on_hand', 'is', null),
  ])

  const invoices = invoicesRes.data ?? []
  const timesheets = timesheetsRes.data ?? []
  const quotes = quotesRes.data ?? []
  const jobs = jobsRes.data ?? []
  const stockItems = priceItemsRes.data ?? []

  // Revenue this month
  const revenueThisMonth = invoices
    .filter(i => i.status === 'paid' && i.created_at >= startOfMonth)
    .reduce((sum, i) => sum + i.total, 0)
  const revenueLastMonth = invoices
    .filter(i => i.status === 'paid' && i.created_at >= startOfLastMonth && i.created_at <= endOfLastMonth)
    .reduce((sum, i) => sum + i.total, 0)

  // Outstanding
  const outstanding = invoices
    .filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status))
    .reduce((sum, i) => sum + (i.total - i.amount_paid), 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + (i.total - i.amount_paid), 0)

  // Quote conversion rate
  const sentQuotes = quotes.filter(q => q.status !== 'draft').length
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length
  const conversionRate = sentQuotes > 0 ? Math.round((acceptedQuotes / sentQuotes) * 100) : 0

  // Labour this month
  const labourHours = timesheets
    .filter(t => t.ended_at && t.started_at >= startOfMonth)
    .reduce((sum, t) => sum + calcDurationHours(t.started_at, t.ended_at, t.break_minutes), 0)
  const billableHours = timesheets
    .filter(t => t.ended_at && t.is_billable && t.started_at >= startOfMonth)
    .reduce((sum, t) => sum + calcDurationHours(t.started_at, t.ended_at, t.break_minutes), 0)
  const labourRevenue = timesheets
    .filter(t => t.ended_at && t.is_billable && t.bill_rate && t.started_at >= startOfMonth)
    .reduce((sum, t) => sum + calcDurationHours(t.started_at, t.ended_at, t.break_minutes) * t.bill_rate!, 0)

  // Low stock
  const lowStock = stockItems.filter(i => i.low_stock_threshold !== null && i.quantity_on_hand! <= i.low_stock_threshold!)

  // Job status breakdown
  const jobStatusCounts = jobs.reduce((acc: Record<string, number>, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      <Header title="Reports" profile={profile} />
      <div className="p-6 space-y-6">
        {/* Revenue */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Revenue</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="This month" value={formatCurrency(revenueThisMonth)} sub={`Last month: ${formatCurrency(revenueLastMonth)}`} />
            <StatCard label="Outstanding" value={formatCurrency(outstanding)} sub={`Overdue: ${formatCurrency(overdue)}`} alert={overdue > 0} />
            <StatCard label="Quote conversion" value={`${conversionRate}%`} sub={`${acceptedQuotes} / ${sentQuotes} sent`} />
            <StatCard label="Active jobs" value={String(jobs.filter(j => ['scheduled', 'in_progress'].includes(j.status)).length)} sub={`Total: ${jobs.length}`} />
          </div>
        </section>

        {/* Labour */}
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Labour (this month)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total hours" value={`${labourHours.toFixed(1)}h`} />
            <StatCard label="Billable hours" value={`${billableHours.toFixed(1)}h`} sub={labourHours > 0 ? `${Math.round((billableHours / labourHours) * 100)}% utilisation` : undefined} />
            <StatCard label="Labour revenue" value={formatCurrency(labourRevenue)} />
          </div>
        </section>

        {/* Jobs breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Jobs by status</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(jobStatusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-600 capitalize w-28">{status.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-orange-400 h-2 rounded-full" style={{ width: `${(count / jobs.length) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                </div>
              ))}
              {jobs.length === 0 && <p className="text-sm text-gray-400">No jobs</p>}
            </CardContent>
          </Card>

          {/* Low stock */}
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
      </div>
    </>
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
