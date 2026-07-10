import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { redirect } from 'next/navigation'
import { LogbookClient } from './client'

export default async function LogbookPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; profileId?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  if (!profile || !['owner', 'admin'].includes(profile.role)) redirect('/dashboard')

  const sp = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const fromDate = sp.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const toDate = sp.to ?? today

  const [teamRes, logsRes, jobsRes] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, vehicle_registration')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('full_name'),
    supabase.from('travel_logs')
      .select('id, profile_id, started_at, ended_at, start_lat, start_lng, end_lat, end_lng, distance_km, purpose, job_id, notes, is_auto, verified_at, jobs!job_id(job_number, title)')
      .eq('company_id', profile.company_id)
      .gte('started_at', `${fromDate}T00:00:00`)
      .lte('started_at', `${toDate}T23:59:59`)
      .eq(sp.profileId ? 'profile_id' : 'company_id', sp.profileId ?? profile.company_id)
      .order('started_at', { ascending: false }),
    supabase.from('jobs')
      .select('id, job_number, title')
      .eq('company_id', profile.company_id)
      .not('status', 'in', '(completed,cancelled)')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  return (
    <>
      <Header title="Vehicle Logbook" profile={profile} />
      <LogbookClient
        logs={(logsRes.data ?? []).map(l => ({ ...l, jobs: Array.isArray(l.jobs) ? (l.jobs[0] ?? null) : l.jobs }))}
        team={teamRes.data ?? []}
        jobs={jobsRes.data ?? []}
        fromDate={fromDate}
        toDate={toDate}
        selectedProfileId={sp.profileId ?? ''}
        companyId={profile.company_id}
      />
    </>
  )
}
