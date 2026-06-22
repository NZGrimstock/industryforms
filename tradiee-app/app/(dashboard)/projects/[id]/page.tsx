import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAddon } from '@/lib/billing'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { Calendar, User, Briefcase, Receipt } from 'lucide-react'
import { ProjectDetailClient } from './client'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name, role, is_super_admin, companies(addons, billing_exempt)')
    .eq('id', user!.id).single()
  if (profile?.role === 'staff') redirect('/dashboard')

  const company = profile?.companies as unknown as { addons: Record<string, { active?: boolean }> | null; billing_exempt: boolean | null } | null
  if (!hasAddon(!!profile?.is_super_admin, company, 'projects')) redirect('/projects')

  const { data: project } = await supabase
    .from('projects')
    .select('*, customers(id, name), profiles!project_manager_id(full_name)')
    .eq('id', id).eq('company_id', profile!.company_id).single()
  if (!project) notFound()

  const [stagesRes, contactsRes, subbiesRes, jobsRes, invoicesRes, teamRes, customersRes] = await Promise.all([
    supabase.from('project_stages').select('*').eq('project_id', id).order('sort_order'),
    supabase.from('project_contacts').select('*').eq('project_id', id).order('created_at'),
    supabase.from('project_subcontractors').select('*').eq('project_id', id).order('created_at'),
    supabase.from('jobs').select('id, job_number, title, status, project_stage_id').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, project_stage_id').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true),
    supabase.from('customers').select('id, name').eq('company_id', profile!.company_id).order('name'),
  ])

  const stages = stagesRes.data ?? []
  const jobs = jobsRes.data ?? []
  const invoices = invoicesRes.data ?? []
  const contacts = contactsRes.data ?? []
  const subbies = subbiesRes.data ?? []
  const team = teamRes.data ?? []
  const customers = customersRes.data ?? []

  const doneStages = stages.filter(s => s.status === 'done').length
  const pct = stages.length ? Math.round((doneStages / stages.length) * 100) : 0
  const currentStage = stages.find(s => s.status === 'in_progress') ?? stages.find(s => s.status !== 'done') ?? null

  const totalInvoiced = invoices.filter(i => i.status !== 'void').reduce((s, i) => s + Number(i.total ?? 0), 0)
  const totalPaid     = invoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0)
  const budget        = project.total_budget ? Number(project.total_budget) : null
  const cust = project.customers as unknown as { id: string; name: string } | null
  const pm   = project.profiles  as unknown as { full_name: string } | null

  return (
    <>
      <Header title={project.name} profile={profile} />
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Hero */}
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{project.name}</h1>
                {project.description && <p className="text-sm text-gray-500 max-w-2xl">{project.description}</p>}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-1.5">
                  {cust && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /><Link href={`/customers/${cust.id}`} className="hover:text-orange-500">{cust.name}</Link></span>}
                  {pm && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />PM: {pm.full_name}</span>}
                  {project.target_end_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Target {formatDate(project.target_end_date)}</span>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{pct}%</p>
                <p className="text-xs text-gray-400">complete</p>
                {currentStage && <p className="text-xs text-gray-500 mt-1">Up next: <span className="font-medium text-gray-700">{currentStage.name}</span></p>}
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-400 via-cyan-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>

            {/* Money rollup */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {budget != null && (
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Budget</p>
                  <p className="text-base font-semibold text-gray-900 tabular-nums">{formatCurrency(budget)}</p>
                </div>
              )}
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Invoiced</p>
                <p className="text-base font-semibold text-gray-900 tabular-nums">{formatCurrency(totalInvoiced)}</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-xl">
                <p className="text-[10px] uppercase tracking-wide text-emerald-600">Collected</p>
                <p className="text-base font-semibold text-emerald-700 tabular-nums">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Jobs</p>
                <p className="text-base font-semibold text-gray-900 tabular-nums">{jobs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stages — interactive */}
        <ProjectDetailClient
          project={{ id: project.id, name: project.name, status: project.status, project_manager_id: project.project_manager_id, customer_id: project.customer_id, total_budget: budget, target_end_date: project.target_end_date, description: project.description }}
          stages={stages}
          jobs={jobs}
          invoices={invoices}
          contacts={contacts}
          subbies={subbies}
          team={team}
          customers={customers}
        />

        {/* Unstaged jobs/invoices (linked to project but no stage) */}
        {(jobs.filter(j => !j.project_stage_id).length > 0 || invoices.filter(i => !i.project_stage_id).length > 0) && (
          <Card>
            <CardHeader><CardTitle>Not yet assigned to a stage</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-gray-50">
                {jobs.filter(j => !j.project_stage_id).map(j => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                      <span className="inline-flex items-center gap-2 text-sm text-gray-700"><Briefcase className="h-4 w-4 text-sky-500" />{j.job_number} — {j.title}</span>
                      <span className="text-xs text-gray-400">{j.status.replace(/_/g, ' ')}</span>
                    </Link>
                  </li>
                ))}
                {invoices.filter(i => !i.project_stage_id).map(i => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                      <span className="inline-flex items-center gap-2 text-sm text-gray-700"><Receipt className="h-4 w-4 text-orange-500" />{i.invoice_number}</span>
                      <span className="text-xs text-gray-700 tabular-nums">{formatCurrency(Number(i.total))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
