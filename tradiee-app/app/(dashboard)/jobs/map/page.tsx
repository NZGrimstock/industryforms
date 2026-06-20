import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { JobMap } from './client'

export default async function JobMapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, job_number, title, status, customer_sites!site_id(address, label), customers(name)')
    .eq('company_id', profile!.company_id)
    .not('site_id', 'is', null)
    .in('status', ['scheduled', 'in_progress', 'unscheduled'])
    .order('created_at', { ascending: false })

  if (jobsError) console.error('[job map] query failed:', jobsError.message)

  type SiteRow = { address: string; label: string | null }
  type CustomerRow = { name: string }

  const mapJobs = (jobs ?? [])
    .filter(j => (j.customer_sites as unknown as SiteRow | null)?.address)
    .map(j => ({
      id: j.id,
      job_number: j.job_number,
      title: j.title,
      status: j.status,
      customer_name: (j.customers as unknown as CustomerRow | null)?.name ?? '',
      address: (j.customer_sites as unknown as SiteRow | null)?.address ?? '',
      site_label: (j.customer_sites as unknown as SiteRow | null)?.label ?? null,
    }))

  return (
    <>
      <Header title="Job Map" profile={profile} />
      <JobMap jobs={mapJobs} />
    </>
  )
}
