// Financial-year boundary: NZ runs 1 Apr–31 Mar, AU runs 1 Jul–30 Jun.
// Returns the UTC instant of local midnight on the FY start date for the
// most recently started financial year (i.e. "today" if today is >= the
// start month/day, otherwise last year's start).
export function currentFinancialYearStart(now: Date, country: string | null | undefined, timeZone: string): Date {
  const startMonth = country === 'AU' ? 7 : 4 // July for AU, April for NZ (also the default)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now)
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
  const localYear = Number(map.year)
  const localMonth = Number(map.month)

  const fyYear = localMonth >= startMonth ? localYear : localYear - 1
  return zonedMidnightToUtc(fyYear, startMonth, 1, timeZone)
}

// Local midnight on (y, m, d) in `timeZone`, as the equivalent UTC instant.
// Standard round-trip technique: format a naive UTC guess back through the
// target timezone, measure the offset that reveals, then correct for it —
// necessary because NZ/AU both observe DST and a fixed offset would be wrong
// roughly half the year (NZ's FY start, 1 April, is often still on daylight
// time — NZDT doesn't end until the first Sunday of April).
function zonedMidnightToUtc(y: number, m: number, d: number, timeZone: string): Date {
  const naiveUtc = new Date(Date.UTC(y, m - 1, d))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(naiveUtc)
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
  const hour = map.hour === '24' ? '00' : map.hour
  const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(hour), Number(map.minute), Number(map.second))
  const offsetMs = asUtc - naiveUtc.getTime()
  return new Date(naiveUtc.getTime() - offsetMs)
}
