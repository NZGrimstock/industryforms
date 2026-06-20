import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { JobMap } from './client'

export default async function JobMapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const [jobsRes, teamRes] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, job_number, title, status, assigned_to, customer_sites!site_id(address, label, lat, lng), customers(name, phone), profiles!assigned_to(full_name)')
      .eq('company_id', profile!.company_id)
      .not('site_id', 'is', null)
      .in('status', ['scheduled', 'in_progress', 'unscheduled'])
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true).order('full_name'),
  ])

  if (jobsRes.error) console.error('[job map] query failed:', jobsRes.error.message)

  type SiteRow = { address: string; label: string | null; lat: number | null; lng: number | null }
  type CustomerRow = { name: string; phone: string | null }
  type AssigneeRow = { full_name: string }

  const mapJobs = (jobsRes.data ?? [])
    .filter(j => (j.customer_sites as unknown as SiteRow | null)?.address)
    .map(j => {
      const site = j.customer_sites as unknown as SiteRow | null
      return {
        id: j.id,
        job_number: j.job_number,
        title: j.title,
        status: j.status,
        assigned_to: (j.assigned_to as string | null) ?? null,
        assignee_name: (j.profiles as unknown as AssigneeRow | null)?.full_name ?? null,
        customer_name: (j.customers as unknown as CustomerRow | null)?.name ?? '',
        customer_phone: (j.customers as unknown as CustomerRow | null)?.phone ?? null,
        address: site?.address ?? '',
        site_label: site?.label ?? null,
        lat: site?.lat != null ? Number(site.lat) : null,
        lng: site?.lng != null ? Number(site.lng) : null,
      }
    })

  return (
    <>
      <Header title="Job Map" profile={profile} />
      <JobMap jobs={mapJobs} team={teamRes.data ?? []} />
    </>
  )
}
