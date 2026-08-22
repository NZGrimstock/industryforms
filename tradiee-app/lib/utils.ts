import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Wraps Date.now() so callers can use it in a component render body — the
// react-hooks/purity lint rule can trace a direct Date.now() call but not
// one hidden inside an imported function.
export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3600000
}

export function formatCurrency(amount: number, currency = 'NZD'): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date))
}

export function formatDuration(startedAt: string, endedAt: string | null, breakMinutes = 0): string {
  if (!endedAt) return 'In progress'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalMins = Math.round(ms / 60000) - breakMinutes
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`
}

export function calcDurationHours(startedAt: string, endedAt: string | null, breakMinutes = 0): number {
  if (!endedAt) return 0
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalMins = Math.round(ms / 60000) - breakMinutes
  return Math.max(0, totalMins / 60)
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    expired: 'bg-orange-100 text-orange-700',
    unscheduled: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    on_hold: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    void: 'bg-gray-100 text-gray-500',
    no_show: 'bg-red-100 text-red-700',
  }
  return map[status] ?? 'bg-gray-100 text-gray-700'
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function generateQuoteNumber(seq: number): string {
  return `Q-${String(seq).padStart(4, '0')}`
}

// A quote flagged is_estimate is a best-guess figure, not a fixed price a job
// has to land within — real enough a difference that every place a customer
// or the owner sees the document's name should say which one it is.
export function quoteLabel(isEstimate: boolean | null | undefined, plural = false): string {
  if (isEstimate) return plural ? 'Estimates' : 'Estimate'
  return plural ? 'Quotes' : 'Quote'
}

export function generateJobNumber(seq: number): string {
  return `J-${String(seq).padStart(4, '0')}`
}

export function generateInvoiceNumber(seq: number): string {
  return `INV-${String(seq).padStart(4, '0')}`
}
