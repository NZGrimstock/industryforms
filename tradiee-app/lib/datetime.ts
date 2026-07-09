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
  return new Date(date).toLocaleString('en-NZ', { timeZone, hour: '2-digit', minute: '2-digit', ...options })
}
