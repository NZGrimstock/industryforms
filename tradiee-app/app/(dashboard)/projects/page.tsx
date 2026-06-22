import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAddon } from '@/lib/billing'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FolderKanban } from 'lucide-react'
import Link from 'next/link'
import { NewProjectButton } from './client'
import { ProjectsUpsell } from './upsell'

const STATUS_COLOR: Record<string, string> = {
  planning:  'bg-gray-100 text-gray-600',
  active:    'bg-emerald-100 text-emerald-700',
  on_hold:   'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-rose-100 text-rose-600',
}

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name, role, is_super_admin, companies(addons, billing_exempt, subscription_status, subscription_plan, trial_ends_at)')
    .eq('id', user!.id).single()
  // Staff don't get projects — keep their nav focused.
  if (profile?.role === 'staff') redirect('/dashboard')

  const company = profile?.companies as unknown as { addons: Record<string, { active?: boolean }> | null; billing_exempt: boolean | null; subscription_status: string | null; subscription_plan: string | null; trial_ends_at: string | null } | null
  const enabled = hasAddon(!!profile?.is_super_admin, company, 'projects')

  if (!enabled) {
    return (
      <>
        <Header title="Projects" profile={profile} />
        <ProjectsUpsell />
      </>
    )
  }

  // Per-project rollup: count jobs (proxy for size), tally completed stages for the % bar.
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, description, status, target_end_date, total_budget, project_manager_id, customers(name), profiles!project_manager_id(full_name), project_stages(id, status), jobs(id)')
    .eq('company_id', profile!.company_id)
    .order('created_at', { ascending: false })

  // Customers (for the New Project dropdown) + team (for PM selector)
  const [{ data: customers }, { data: team }] = await Promise.all([
    supabase.from('customers').select('id, name').eq('company_id', profile!.company_id).order('name'),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true),
  ])

  return (
    <>
      <Header title="Projects" profile={profile} />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Multi-stage work — renovations, builds, fitouts. Track stages, jobs, invoices, contacts and subbies all in one place.</p>
          <NewProjectButton companyId={profile!.company_id} customers={customers ?? []} team={team ?? []} />
        </div>

        {!projects?.length ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create a project to group stages, jobs and invoices for a larger piece of work."
            action={<NewProjectButton companyId={profile!.company_id} customers={customers ?? []} team={team ?? []} />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => {
              const stages = (p.project_stages as { id: string; status: string }[] | null) ?? []
              const done = stages.filter(s => s.status === 'done').length
              const pct = stages.length ? Math.round((done / stages.length) * 100) : 0
              const cust = p.customers as unknown as { name: string } | null
              const pm = p.profiles as unknown as { full_name: string } | null
              const jobCount = ((p.jobs as { id: string }[] | null) ?? []).length
              return (
                <Link key={p.id} href={`/projects/${p.id}`} className="group">
                  <Card className="h-full transition-all duration-150 hover:shadow-md hover:-translate-y-0.5">
                    <CardContent className="space-y-3 py-5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-semibold text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-2">{p.name}</h3>
                        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLOR[p.status] ?? STATUS_COLOR.planning}`}>
                          {String(p.status).replace('_', ' ')}
                        </span>
                      </div>
                      {cust && <p className="text-sm text-gray-600 -mt-1">{cust.name}</p>}
                      {p.description && <p className="text-xs text-gray-500 line-clamp-2">{p.description}</p>}

                      <div>
                        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                          <span>{stages.length ? `${done}/${stages.length} stages` : 'No stages yet'}</span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                        <span>{jobCount} job{jobCount === 1 ? '' : 's'}{p.total_budget ? ` · ${formatCurrency(Number(p.total_budget))}` : ''}</span>
                        <span className="text-gray-400">{pm?.full_name ?? 'No PM'}{p.target_end_date ? ` · due ${formatDate(p.target_end_date)}` : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
