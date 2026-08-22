import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { TodoClient } from './client'

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()
  const { data: team } = await supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true)
  const { data: jobs } = await supabase.from('jobs').select('id, job_number, title').eq('company_id', profile!.company_id).in('status', ['unscheduled', 'scheduled', 'in_progress']).order('created_at', { ascending: false }).limit(50)

  let query = supabase.from('todos')
    .select('*, profiles!todos_assigned_to_fkey(full_name), jobs(job_number, title)')
    .eq('company_id', profile!.company_id)

  if (sp.status) {
    query = query.eq('status', sp.status)
  } else {
    query = query.neq('status', 'done')
  }
  if (sp.mine === '1') query = query.eq('assigned_to', user!.id)

  const { data: todos } = await query.order('due_date', { ascending: true, nullsFirst: false }).order('created_at')

  return (
    <>
      <Header title="To-Do" profile={profile} />
      <TodoClient
        todos={todos ?? []}
        companyId={profile!.company_id}
        profileId={user!.id}
        team={team ?? []}
        jobs={jobs ?? []}
        currentStatus={sp.status}
        mineOnly={sp.mine === '1'}
      />
    </>
  )
}
