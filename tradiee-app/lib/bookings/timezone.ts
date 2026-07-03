// DST-safe IANA timezone conversion using only Intl (full tzdata built into
// Node/V8 — no date-fns-tz or luxon needed for this one operation).

/** UTC offset in minutes for `timeZone` at the instant `date` represents. */
function offsetMinutesAt(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return (asUtc - date.getTime()) / 60000
}

/**
 * Convert a wall-clock date+time in `timeZone` to the correct UTC instant,
 * DST-aware. E.g. zonedTimeToUtc(2026, 4, 5, 14, 30, 'Pacific/Auckland') gives
 * the UTC Date for 2:30pm NZ time on that date, whichever side of the NZDT/NZST
 * transition it falls on.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offset = offsetMinutesAt(utcGuess, timeZone)
  // Re-derive with the guessed offset — a second pass handles the rare case
  // where the offset itself changes between the guess and the corrected time
  // (only matters within the DST transition hour itself).
  const corrected = new Date(utcGuess.getTime() - offset * 60000)
  const offset2 = offsetMinutesAt(corrected, timeZone)
  return new Date(utcGuess.getTime() - offset2 * 60000)
}

/** The (year, month, day, weekday 0=Sun..6=Sat) for a UTC instant, as seen in `timeZone`. */
export function zonedDateParts(date: Date, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { year: +parts.year, month: +parts.month, day: +parts.day, weekday: weekdayMap[parts.weekday] ?? 0 }
}
