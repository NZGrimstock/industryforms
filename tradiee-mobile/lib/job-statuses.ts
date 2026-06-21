// Custom job statuses for mobile — mirrors web app's lib/job-statuses.ts, but
// resolves colour tokens to hex (React Native has no Tailwind classes).
// Falls back to the defaults so companies that haven't customised still work.

import { supabase } from '@/lib/supabase'

export type JobStatus = { key: string; label: string; color: string; sort_order: number; is_terminal: boolean }

export const DEFAULT_JOB_STATUSES: JobStatus[] = [
  { key: 'unscheduled', label: 'Unscheduled', color: 'gray',   sort_order: 0, is_terminal: false },
  { key: 'scheduled',   label: 'Scheduled',   color: 'blue',   sort_order: 1, is_terminal: false },
  { key: 'in_progress', label: 'In progress', color: 'orange', sort_order: 2, is_terminal: false },
  { key: 'on_hold',     label: 'On hold',     color: 'yellow', sort_order: 3, is_terminal: false },
  { key: 'completed',   label: 'Completed',   color: 'green',  sort_order: 4, is_terminal: true },
  { key: 'cancelled',   label: 'Cancelled',   color: 'red',    sort_order: 5, is_terminal: true },
]

// Colour-token → hex, matching the Tailwind shades the web badges use.
const HEX: Record<string, string> = {
  gray: '#6b7280', blue: '#3b82f6', orange: '#f97316', yellow: '#eab308',
  green: '#22c55e', red: '#ef4444', purple: '#a855f7', teal: '#14b8a6', pink: '#ec4899',
}

export function statusHex(color: string | undefined): string {
  return HEX[color ?? 'gray'] ?? HEX.gray
}

// Resolve a job's status key into colour + label using a status list (custom or default).
export function resolveStatus(statuses: JobStatus[], key: string): { hex: string; label: string } {
  const s = statuses.find(st => st.key === key)
  return { hex: statusHex(s?.color), label: s?.label ?? key }
}

export async function getJobStatuses(companyId: string): Promise<JobStatus[]> {
  const { data } = await supabase
    .from('job_statuses')
    .select('key, label, color, sort_order, is_terminal')
    .eq('company_id', companyId)
    .order('sort_order')
  return data && data.length ? (data as JobStatus[]) : DEFAULT_JOB_STATUSES
}
