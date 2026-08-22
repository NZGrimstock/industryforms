// Shared date/time formatting that respects the acting user's stored profile
// timezone, instead of whatever the device/server happens to be running in.

export const TIMEZONES = [
  { value: 'Pacific/Auckland', label: 'Auckland (NZ)' },
  { value: 'Pacific/Chatham', label: 'Chatham Islands (NZ)' },
  { value: 'Australia/Sydney', label: 'Sydney (AU)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AU)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AU)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (AU)' },
  { value: 'Australia/Perth', label: 'Perth (AU)' },
  { value: 'Australia/Darwin', label: 'Darwin (AU)' },
  { value: 'Australia/Hobart', label: 'Hobart (AU)' },
  { value: 'UTC', label: 'UTC' },
] as const

export const DEFAULT_TIMEZONE = 'Pacific/Auckland'

export function formatDate(date: Date | string | number, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString('en-NZ', { timeZone, ...options })
}

export function formatTime(date: Date | string | number, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleTimeString('en-NZ', { timeZone, hour: '2-digit', minute: '2-digit', ...options })
}

export function formatDateTime(date: Date | string | number, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  // hour/minute can't be combined with dateStyle/timeStyle (Intl throws) — only
  // apply the hour/minute default when the caller isn't already using style shorthand.
  const defaults = options?.dateStyle || options?.timeStyle ? {} : { hour: '2-digit' as const, minute: '2-digit' as const }
  return new Date(date).toLocaleString('en-NZ', { timeZone, ...defaults, ...options })
}

// Rolls a YYYY-MM-DD date forward by a recurrence interval. Shared by
// recurring jobs/invoices/service reminders and the statement-run schedule
// (all in app/api/reminders/route.ts) plus the Statements page, which needs
// the identical math to preview "next run" when the user picks an interval.
export function addInterval(dateStr: string, interval: string | null): string {
  const d = new Date(dateStr)
  switch (interval) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    default: d.setFullYear(d.getFullYear() + 1)
  }
  return d.toISOString().slice(0, 10)
}
