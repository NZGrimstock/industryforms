// Custom job statuses: per-company definitions with a fallback to the defaults
// (so companies that haven't customised — or new ones — still work).

export type JobStatus = { key: string; label: string; color: string; sort_order: number; is_terminal: boolean }

export const DEFAULT_JOB_STATUSES: JobStatus[] = [
  { key: 'unscheduled', label: 'Unscheduled', color: 'gray', sort_order: 0, is_terminal: false },
  { key: 'scheduled', label: 'Scheduled', color: 'blue', sort_order: 1, is_terminal: false },
  { key: 'in_progress', label: 'In progress', color: 'orange', sort_order: 2, is_terminal: false },
  { key: 'on_hold', label: 'On hold', color: 'yellow', sort_order: 3, is_terminal: false },
  { key: 'completed', label: 'Completed', color: 'green', sort_order: 4, is_terminal: true },
  { key: 'cancelled', label: 'Cancelled', color: 'red', sort_order: 5, is_terminal: true },
]

export const STATUS_COLOR_TOKENS = ['gray', 'blue', 'orange', 'yellow', 'green', 'red', 'purple', 'teal', 'pink'] as const

// Static (Tailwind-safe) class maps keyed by colour token.
const BADGE: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-700', blue: 'bg-blue-100 text-blue-700', orange: 'bg-orange-100 text-orange-700',
  yellow: 'bg-yellow-100 text-yellow-700', green: 'bg-green-100 text-green-700', red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700', teal: 'bg-teal-100 text-teal-700', pink: 'bg-pink-100 text-pink-700',
}
const BOARD_BG: Record<string, string> = {
  gray: 'bg-gray-50', blue: 'bg-blue-50', orange: 'bg-orange-50', yellow: 'bg-yellow-50', green: 'bg-green-50',
  red: 'bg-red-50', purple: 'bg-purple-50', teal: 'bg-teal-50', pink: 'bg-pink-50',
}
const BOARD_TEXT: Record<string, string> = {
  gray: 'text-gray-500', blue: 'text-blue-600', orange: 'text-orange-600', yellow: 'text-yellow-600', green: 'text-green-600',
  red: 'text-red-600', purple: 'text-purple-600', teal: 'text-teal-600', pink: 'text-pink-600',
}

export function jobStatusBadgeClass(color: string): string { return BADGE[color] ?? BADGE.gray }
export function jobStatusBoardBg(color: string): string { return BOARD_BG[color] ?? BOARD_BG.gray }
export function jobStatusBoardText(color: string): string { return BOARD_TEXT[color] ?? BOARD_TEXT.gray }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getJobStatuses(supabase: any, companyId: string): Promise<JobStatus[]> {
  const { data } = await supabase
    .from('job_statuses')
    .select('key, label, color, sort_order, is_terminal')
    .eq('company_id', companyId)
    .order('sort_order')
  return data && data.length ? (data as JobStatus[]) : DEFAULT_JOB_STATUSES
}
