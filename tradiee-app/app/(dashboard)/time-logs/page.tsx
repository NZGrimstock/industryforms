import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { Clock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { TimesheetActions } from '../timesheets/client'
import { TimesheetTable } from '@/components/timesheets/timesheet-table'

export default async function TimeLogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, hourly_bill_rate, timezone').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const timezone = profile.timezone ?? DEFAULT_TIMEZONE

  const [timesheetsRes, jobsRes] = await Promise.all([
    supabase.from('timesheets').select('*, profiles(full_name), jobs(job_number, title)').eq('company_id', profile.company_id).order('started_at', { ascending: false }).limit(100),
    supabase.from('jobs').select('id, job_number, title').eq('company_id', profile.company_id).in('status', ['scheduled', 'in_progress', 'unscheduled']).order('job_number'),
  ])

  const timesheets = timesheetsRes.data ?? []
  const totalHoursThisWeek = timesheets
    .filter(t => t.ended_at && new Date(t.started_at) >= new Date(Date.now() - 7 * 86400000))
    .reduce((sum, t) => {
      const ms = new Date(t.ended_at!).getTime() - new Date(t.started_at).getTime()
      return sum + Math.max(0, ms / 3600000 - t.break_minutes / 60)
    }, 0)

  return (
    <>
      <Header title="Time Logs" profile={profile} />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500"><strong>{totalHoursThisWeek.toFixed(1)}h</strong> logged this week</p>
          <TimesheetActions companyId={profile.company_id} profileId={user.id} jobs={jobsRes.data ?? []} billRate={profile.hourly_bill_rate ?? null} />
        </div>

        {timesheets.length === 0 ? (
          <EmptyState icon={Clock} title="No time logged" description="Log time against jobs to track labour costs and billable hours" />
        ) : (
          <Card className="overflow-hidden">
            <TimesheetTable timesheets={timesheets} jobs={jobsRes.data ?? []} timezone={timezone} />
          </Card>
        )}
      </div>
    </>
  )
}
