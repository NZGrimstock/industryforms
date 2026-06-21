import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Briefcase, List, LayoutGrid, Map } from 'lucide-react'
import React from 'react'
import { NewJobButton } from './client'
import { JobBoard } from './board'
import { JobTemplatesPanel, ServiceRemindersPanel } from './panels'
import { ListSearch } from '@/components/ui/list-search'
import { nextDocNumber } from '@/lib/numbering'

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; view?: string; q?: string; tab?: string; newJob?: string; title?: string; description?: string }> }) {
  const sp = await searchParams
  const tab = (sp.tab ?? 'jobs') as 'jobs' | 'recurring' | 'templates' | 'reminders'
  const view = (sp.view ?? 'list') as 'list' | 'board' | 'map'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()
  const [customersRes, priceItemsRes] = await Promise.all([
    supabase.from('customers').select('id, name').eq('company_id', profile!.company_id).order('name'),
    supabase.from('price_list_items').select('id, name, unit, sell_price, cost_price').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
  ])
  const customers = customersRes.data
  const priceItems = priceItemsRes.data ?? []

  // Board needs all active statuses; list can be filtered
  let query = supabase.from('jobs').select('*, customers(name), profiles(full_name), customer_sites(address)').eq('company_id', profile!.company_id)
  if (tab === 'recurring') query = query.eq('is_recurring', true)
  if (view === 'list' && sp.status) query = query.eq('status', sp.status)
  if (view === 'list' && sp.q) query = query.or(`job_number.ilike.%${sp.q}%,title.ilike.%${sp.q}%,reference.ilike.%${sp.q}%`)
  if (view === 'board' && tab === 'jobs') query = query.not('status', 'in', '(cancelled)')
  const { data: jobs } = await query.order('created_at', { ascending: false })

  const statuses = ['unscheduled', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled']
  const nextJobNumber = await nextDocNumber(supabase, profile!.company_id, 'job')

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
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
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
              <Link href="/jobs?view=list" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</Link>
              {statuses.map(s => (
                <Link key={s} href={`/jobs?view=list&status=${s}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${sp.status === s ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {s.replace(/_/g, ' ')}
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
            <NewJobButton companyId={profile!.company_id} customers={customers ?? []} nextJobNumber={nextJobNumber} priceItems={priceItems} initialOpen={sp.newJob === '1'} initialTitle={sp.title ?? ''} initialDescription={sp.description ?? ''} />
          </div>
        </div>

        {view === 'board' && (
          <JobBoard initialJobs={(jobs ?? []) as Parameters<typeof JobBoard>[0]['initialJobs']} />
        )}

        {view === 'list' && (
          <ListSearch placeholder="Search jobs by number, title or reference…" basePath="/jobs" status={sp.status} defaultValue={sp.q} />
        )}

        {view === 'list' && (
          !jobs?.length ? (
            <EmptyState icon={Briefcase} title="No jobs" description="Create a job to start tracking work" action={
              <NewJobButton companyId={profile!.company_id} customers={customers ?? []} nextJobNumber={nextJobNumber} priceItems={priceItems} />
            } />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Job #</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Title</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Reference</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Assigned to</th>
                    <th className="text-left px-6 py-3 font-medium text-gray-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {jobs.map(j => (
                    <tr key={j.id} className="hover:bg-gray-50 cursor-pointer">
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 font-medium text-gray-900">{j.job_number}</Link></td>
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-700 max-w-[200px] truncate">{j.title}</Link></td>
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-600">{(j.customers as {name: string} | null)?.name ?? '—'}</Link></td>
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-400">{j.reference ?? '—'}</Link></td>
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3"><StatusBadge status={j.status} /></Link></td>
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-500">{(j.profiles as {full_name: string} | null)?.full_name ?? '—'}</Link></td>
                      <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-400">{formatDate(j.created_at)}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        )}
        </>
        )}
      </div>
    </>
  )
}
