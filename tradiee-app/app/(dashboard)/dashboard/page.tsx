import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { CheckSquare, Briefcase, Receipt, Clock } from 'lucide-react'
import Link from 'next/link'
import { getProfitabilityStatus } from '@/components/ui/profitability-badge'
import { OnboardingChecklist } from '@/components/ui/onboarding-checklist'
import { DashboardGreeting } from '@/components/ui/dashboard-greeting'
import { TodoWidget } from '@/components/dashboard/todo-widget'
import { DashboardWidgets, type DashboardWidget, type DashboardWidgetConfig } from '@/components/dashboard/dashboard-widgets'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(*)').eq('id', user.id).single()
  const timesheetSince = new Date()
  timesheetSince.setDate(timesheetSince.getDate() - 7)

  // Parallel data fetches for stats
  const [quotesRes, jobsRes, invoicesRes, timesheetsRes, activeJobsRes, todosRes] = await Promise.all([
    supabase.from('quotes').select('id, status, total').eq('company_id', profile?.company_id),
    supabase.from('jobs').select('id, job_number, title, status').eq('company_id', profile?.company_id),
    supabase.from('invoices').select('id, status, total, amount_paid').eq('company_id', profile?.company_id),
    supabase.from('timesheets').select('id, started_at, ended_at, break_minutes').eq('company_id', profile?.company_id)
      .gte('started_at', timesheetSince.toISOString()),
    supabase.from('jobs')
      .select('id, job_number, title, quote_id, job_materials(quantity, unit_cost), timesheets(started_at, ended_at, cost_rate, bill_rate)')
      .eq('company_id', profile?.company_id)
      .in('status', ['scheduled', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('todos')
      .select('id, title, status, priority, due_date, job_id, jobs(job_number, title)')
      .eq('company_id', profile?.company_id)
      .eq('assigned_to', user.id)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
  ])

  const quotes = quotesRes.data ?? []
  const jobs = jobsRes.data ?? []
  const invoices = invoicesRes.data ?? []

  // Onboarding checklist signals
  const [{ count: customerCount }, { count: staffCount }] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('company_id', profile?.company_id),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', profile?.company_id),
  ])
  const co = (profile?.companies ?? {}) as { logo_url?: string | null; gst_number?: string | null }
  const onboardingSteps = [
    { label: 'Add your company logo', done: !!co.logo_url, href: '/settings' },
    { label: 'Add your GST number', done: !!co.gst_number, href: '/settings' },
    { label: 'Add a customer', done: (customerCount ?? 0) > 0, href: '/customers' },
    { label: 'Create a quote', done: quotes.length > 0, href: '/quotes/new' },
    { label: 'Create a job', done: jobs.length > 0, href: '/jobs' },
    { label: 'Send an invoice', done: invoices.length > 0, href: '/invoices' },
    { label: 'Invite a staff member', done: (staffCount ?? 0) > 1, href: '/settings' },
  ]

  const acceptedQuotes = quotes.filter(q => q.status === 'accepted').length
  const scheduledJobs = jobs.filter(j => j.status === 'scheduled').length
  const outstanding = invoices
    .filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status))
    .reduce((sum, i) => sum + (i.total - i.amount_paid), 0)
  const recentHours = (timesheetsRes.data ?? []).reduce((sum, t) => {
    if (!t.ended_at) return sum
    const ms = new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()
    return sum + Math.max(0, ms / 3600000 - t.break_minutes / 60)
  }, 0)

  const todos = (todosRes.data ?? []).map(t => ({
    ...t,
    jobs: t.jobs
      ? (Array.isArray(t.jobs) ? t.jobs[0] : t.jobs) as { job_number: string; title: string } | null
      : null,
  }))

  const stats = [
    { label: 'Accepted quotes', value: acceptedQuotes, icon: CheckSquare, href: '/quotes?status=accepted', color: 'text-blue-600 bg-blue-50', ring: 'group-hover:ring-blue-200' },
    { label: 'Scheduled jobs', value: scheduledJobs, icon: Briefcase, href: '/jobs?status=scheduled', color: 'text-[var(--accent,#f97316)] bg-orange-50', ring: 'group-hover:ring-orange-200' },
    { label: 'Outstanding', value: formatCurrency(outstanding), icon: Receipt, href: '/invoices', color: 'text-green-600 bg-green-50', ring: 'group-hover:ring-green-200' },
    { label: 'Hours this week', value: recentHours.toFixed(1) + 'h', icon: Clock, href: '/time-logs', color: 'text-purple-600 bg-purple-50', ring: 'group-hover:ring-purple-200' },
  ]

  const recentJobs = jobs.slice(0, 5)
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')

  // Profitability: fetch quote line item totals for active jobs
  const profitabilityJobs = activeJobsRes.data ?? []
  const quoteIds = profitabilityJobs.map(j => j.quote_id).filter(Boolean) as string[]
  const quoteSubtotals: Record<string, number> = {}
  if (quoteIds.length > 0) {
    const { data: qLines } = await supabase
      .from('quote_line_items')
      .select('quote_id, quantity, unit_price')
      .in('quote_id', quoteIds)
    ;(qLines ?? []).forEach(l => {
      quoteSubtotals[l.quote_id] = (quoteSubtotals[l.quote_id] ?? 0) + Number(l.quantity) * Number(l.unit_price)
    })
  }

  const jobsWithProfitability = profitabilityJobs.map(j => {
    const mats = (j.job_materials as unknown as Array<{quantity: number; unit_cost: number | null}>) ?? []
    const ts = (j.timesheets as unknown as Array<{started_at: string; ended_at: string | null; cost_rate: number | null; bill_rate: number | null}>) ?? []
    const materialsCost = mats.reduce((s, m) => s + Number(m.quantity) * Number(m.unit_cost ?? 0), 0)
    const labourCost = ts.reduce((s, t) => {
      if (!t.ended_at) return s
      const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000
      return s + hrs * Number(t.cost_rate ?? t.bill_rate ?? 0)
    }, 0)
    const quotedSubtotal = j.quote_id ? (quoteSubtotals[j.quote_id] ?? 0) : 0
    return { ...j, materialsCost, labourCost, quotedSubtotal, profitability: getProfitabilityStatus({ quotedSubtotal, materialsCost, labourCost }) }
  })

  const dashboardWidgetCandidates: DashboardWidget[] = [
    {
      id: 'stats' as const,
      label: 'Stats',
      node: (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <Link key={s.label} href={s.href} className="group">
              <Card className={`cursor-pointer transition-all duration-150 ring-1 ring-transparent group-hover:-translate-y-0.5 group-hover:shadow-md ${s.ring}`}>
                <CardContent className="py-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`rounded-xl p-2.5 ${s.color}`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">{s.value}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ),
    },
    {
      id: 'todos' as const,
      label: 'To-Do',
      node: <TodoWidget todos={todos} userId={user.id} companyId={profile?.company_id} />,
    },
    {
      id: 'recent_jobs' as const,
      label: 'Recent jobs',
      node: (
        <Card>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent jobs</h2>
            <Link href="/jobs" className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">View all</Link>
          </div>
          <CardContent className="p-0">
            {recentJobs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No jobs yet</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {recentJobs.map((j: {id: string; job_number: string; title: string; status: string}) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-orange-500 mr-2">{j.job_number}</span>
                        <span className="text-sm text-gray-700 truncate">{j.title}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ml-2 ${statusColors[j.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {j.status.replace(/_/g, ' ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'overdue_invoices' as const,
      label: 'Overdue invoices',
      node: (
        <Card>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Overdue invoices</h2>
            <Link href="/invoices?status=overdue" className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">View all</Link>
          </div>
          <CardContent className="p-0">
            {overdueInvoices.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No overdue invoices</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {overdueInvoices.slice(0, 5).map((i: {id: string; total: number; amount_paid: number}) => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                      <span className="text-sm text-gray-700">#{i.id.slice(0, 8)}</span>
                      <span className="text-sm font-medium text-red-600">{formatCurrency(i.total - i.amount_paid)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'profitability' as const,
      label: 'Job profitability',
      node: jobsWithProfitability.length > 0 ? (
        <Card>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Job profitability</h2>
            <Link href="/jobs?view=list&status=in_progress" className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">View jobs</Link>
          </div>
          <CardContent className="p-0">
            <ul className="divide-y divide-gray-50">
              {jobsWithProfitability.map(j => (
                <li key={j.id}>
                  <Link href={`/jobs/${j.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-orange-500 mr-2">{j.job_number}</span>
                      <span className="text-sm text-gray-700 truncate">{j.title}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      {j.profitability ? (
                        <>
                          <span className="text-xs text-gray-400">{j.profitability.pct}% of budget</span>
                          <span className="text-base" title={j.profitability.label}>{j.profitability.emoji}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">No quote</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null,
    },
  ]
  const dashboardWidgets = dashboardWidgetCandidates.filter(widget => widget.node !== null)

  return (
    <>
      <Header title="Dashboard" profile={profile} />
      <div className="p-6 space-y-6">
        <DashboardGreeting firstName={profile?.full_name?.split(' ')[0] ?? 'there'} />
        <OnboardingChecklist steps={onboardingSteps} />

        {/* Trial banner */}
        {profile?.companies && (profile.companies as {subscription_plan: string}).subscription_plan === 'trial' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-800 flex items-center justify-between">
            <span>You&apos;re on a free trial — <strong>30 days remaining</strong>.</span>
            <Link href="/settings" className="font-medium underline hover:no-underline">Upgrade plan</Link>
          </div>
        )}

        <DashboardWidgets
          profileId={user.id}
          widgets={dashboardWidgets}
          initialConfig={profile?.dashboard_widgets as DashboardWidgetConfig | null}
        />
      </div>
    </>
  )
}

const statusColors: Record<string, string> = {
  unscheduled: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  on_hold: 'bg-orange-100 text-[var(--accent,#f97316)]',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}
