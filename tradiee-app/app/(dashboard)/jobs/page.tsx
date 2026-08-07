import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { EmptyState } from '@/components/ui/empty-state'
import { getJobStatuses } from '@/lib/job-statuses'
import Link from 'next/link'
import { Briefcase, List, LayoutGrid, Map } from 'lucide-react'
import React from 'react'
import { NewJobButton } from './client'
import { JobBoard } from './board'
import { JobTemplatesPanel, ServiceRemindersPanel } from './panels'
import { ListSearch } from '@/components/ui/list-search'
import { JobsListTable } from '@/components/jobs/jobs-list-table'
import { nextDocNumber } from '@/lib/numbering'

const SORTABLE = ['job_number', 'title', 'status', 'created_at']

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; view?: string; q?: string; tab?: string; newJob?: string; title?: string; description?: string; customerId?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams
  const tab = (sp.tab ?? 'jobs') as 'jobs' | 'recurring' | 'templates' | 'reminders'
  const view = (sp.view ?? 'list') as 'list' | 'board' | 'map'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, companies!company_id(standard_markup_enabled, standard_markup_pct, default_job_assignee_id, default_gst_rate)').eq('id', user!.id).single()
  const [customersRes, priceItemsRes, jobStatuses, teamRes] = await Promise.all([
    supabase.from('customers').select('id, name, pricing_group_id').eq('company_id', profile!.company_id).order('name'),
    supabase.from('price_list_items').select('id, name, unit, sell_price, cost_price, customer_group_prices(customer_group_id, sell_price)').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    getJobStatuses(supabase, profile!.company_id),
    supabase.from('profiles').select('id, full_name, email').eq('company_id', profile!.company_id).eq('is_active', true).order('full_name'),
  ])
  const customers = customersRes.data
  const priceItems = priceItemsRes.data ?? []
  const teamMembers = teamRes.data ?? []
  const companySettings = profile!.companies as { standard_markup_enabled?: boolean; standard_markup_pct?: number; default_job_assignee_id?: string | null; default_gst_rate?: number } | null
  const gstRate = companySettings?.default_gst_rate ?? 0.15
  const terminalKeys = jobStatuses.filter(s => s.is_terminal).map(s => s.key)

  // Board needs all active statuses; list can be filtered.
  // Default list view ("Active", no status param) hides terminal statuses
  // (completed/cancelled) so finished work doesn't clutter the working list —
  // still reachable via their own status pill, or the explicit "All" pill.
  let query = supabase.from('jobs').select('*, customers(name), profiles(full_name), customer_sites(address)').eq('company_id', profile!.company_id)
  if (tab === 'recurring') query = query.eq('is_recurring', true)
  if (view === 'list' && sp.status && sp.status !== '__all__') query = query.eq('status', sp.status)
  else if (view === 'list' && !sp.status && terminalKeys.length) query = query.not('status', 'in', `(${terminalKeys.join(',')})`)
  if (view === 'list' && sp.q) query = query.or(`job_number.ilike.%${sp.q}%,title.ilike.%${sp.q}%,reference.ilike.%${sp.q}%`)
  if (view === 'board' && tab === 'jobs') query = query.not('status', 'in', '(cancelled)')
  const sortCol = SORTABLE.includes(sp.sort ?? '') ? sp.sort! : 'created_at'
  const asc = sp.sort ? sp.dir === 'asc' : false
  const sortParams = { view: 'list', ...(tab !== 'jobs' ? { tab } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}) }
  const [{ data: rawJobs }, nextJobNumber, { data: invoicedJobRows }] = await Promise.all([
    query.order(sortCol, { ascending: asc }),
    nextDocNumber(supabase, profile!.company_id, 'job'),
    supabase.from('invoices').select('job_id').eq('company_id', profile!.company_id).not('job_id', 'is', null).neq('status', 'void'),
  ])

  // A completed job that's been invoiced is done in every sense — from here
  // it only needs to exist as an invoice, not as a job anymore. Applied
  // across every filter/view (not just the default "Active" list), since the
  // point is it's no longer findable as a job at all, only via Invoices.
  const invoicedJobIds = new Set((invoicedJobRows ?? []).map(r => r.job_id))
  const jobs = (rawJobs ?? []).filter(j => !(j.status === 'completed' && invoicedJobIds.has(j.id)))

  const viewLinks: Array<{ key: string; icon: React.ComponentType<{className?: string}>; label: string; href?: string }> = [
    { key: 'list', icon: List, label: 'List' },
    { key: 'board', icon: LayoutGrid, label: 'Board' },
    { key: 'map', icon: Map, label: 'Map', href: '/jobs/map' },
  ]

  return (
    <>
      <Header title="Jobs" profile={profile} />
      <div className="p-6">
        {/* Section tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-100">
          {([['jobs', 'Jobs'], ['recurring', 'Recurring'], ['templates', 'Templates'], ['reminders', 'Service Reminders']] as const).map(([key, label]) => (
            <Link key={key} href={key === 'jobs' ? '/jobs' : `/jobs?tab=${key}`}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-[var(--accent,#f97316)] text-[var(--accent,#f97316)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </Link>
          ))}
        </div>

        {tab === 'templates' && <JobTemplatesPanel companyId={profile!.company_id} />}
        {tab === 'reminders' && <ServiceRemindersPanel companyId={profile!.company_id} customers={customers ?? []} />}

        {(tab === 'jobs' || tab === 'recurring') && (
        <>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          {/* Status filters (list view only) */}
          {view === 'list' && (
            <div className="flex gap-1 overflow-x-auto">
              <Link href="/jobs?view=list" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Active</Link>
              <Link href="/jobs?view=list&status=__all__" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${sp.status === '__all__' ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</Link>
              {jobStatuses.map(s => (
                <Link key={s.key} href={`/jobs?view=list&status=${s.key}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${sp.status === s.key ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {s.label}
                </Link>
              ))}
            </div>
          )}
          {view === 'board' && <p className="text-sm text-gray-500">Drag cards to update status</p>}

          <div className="flex items-center gap-2 ml-auto">
            {/* View toggle */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {viewLinks.map(({ key, icon: Icon, label, href: customHref }) => (
                <Link
                  key={key}
                  href={customHref ?? `/jobs?view=${key}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Icon className="h-3.5 w-3.5" />{label}
                </Link>
              ))}
            </div>
            <NewJobButton companyId={profile!.company_id} customers={customers ?? []} teamMembers={teamMembers} defaultJobAssigneeId={companySettings?.default_job_assignee_id ?? null} nextJobNumber={nextJobNumber} priceItems={priceItems} standardMarkupEnabled={!!companySettings?.standard_markup_enabled} standardMarkupPct={Number(companySettings?.standard_markup_pct ?? 80)} initialOpen={sp.newJob === '1'} initialTitle={sp.title ?? ''} initialDescription={sp.description ?? ''} initialCustomerId={sp.customerId ?? ''} />
          </div>
        </div>

        {view === 'board' && (
          <JobBoard initialJobs={(jobs ?? []) as Parameters<typeof JobBoard>[0]['initialJobs']} statuses={jobStatuses} />
        )}

        {view === 'list' && (
          <ListSearch placeholder="Search jobs by number, title or reference…" basePath="/jobs" status={sp.status} defaultValue={sp.q} />
        )}

        {view === 'list' && (
          !jobs?.length ? (
            <EmptyState icon={Briefcase} title="No jobs" description="Create a job to start tracking work" action={
              <NewJobButton companyId={profile!.company_id} customers={customers ?? []} teamMembers={teamMembers} defaultJobAssigneeId={companySettings?.default_job_assignee_id ?? null} nextJobNumber={nextJobNumber} priceItems={priceItems} standardMarkupEnabled={!!companySettings?.standard_markup_enabled} standardMarkupPct={Number(companySettings?.standard_markup_pct ?? 80)} />
            } />
          ) : (
            <JobsListTable
              jobs={jobs as unknown as Parameters<typeof JobsListTable>[0]['jobs']}
              jobStatuses={jobStatuses}
              companyId={profile!.company_id}
              gstRate={gstRate}
              sortParams={sortParams}
              sort={sp.sort}
              dir={sp.dir}
            />
          )
        )}
        </>
        )}
      </div>
    </>
  )
}
