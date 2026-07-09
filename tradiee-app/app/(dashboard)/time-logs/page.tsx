import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate, formatDuration, formatCurrency } from '@/lib/utils'
import { DEFAULT_TIMEZONE, formatTime } from '@/lib/datetime'
import { Clock } from 'lucide-react'
import { redirect } from 'next/navigation'
import { TimesheetActions } from '../timesheets/client'

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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Person</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Job</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Date</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Start</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Duration</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Rate</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Billable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {timesheets.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-700">{(t.profiles as {full_name: string} | null)?.full_name ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {t.jobs ? <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">{(t.jobs as {job_number: string}).job_number}</span> : '—'}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{formatDate(t.started_at)}</td>
                    <td className="px-6 py-3 text-gray-500">{formatTime(t.started_at, timezone, { hour12: true })}</td>
                    <td className="px-6 py-3 font-medium text-gray-800">{formatDuration(t.started_at, t.ended_at, t.break_minutes)}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{t.bill_rate ? formatCurrency(t.bill_rate) + '/hr' : '—'}</td>
                    <td className="px-6 py-3">{t.is_billable ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
