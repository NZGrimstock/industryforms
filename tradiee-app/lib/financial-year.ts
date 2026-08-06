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
// Necessary because NZ/AU both observe DST and a fixed offset would be wrong
// roughly half the year (NZ's FY start, 1 April, is often still on daylight
// time — NZDT doesn't end until the first Sunday of April).
//
// Fixed-point iteration, not a single correction pass: a single pass measures
// the offset at a *naive* UTC guess (treating the target wall-clock time as
// if it were already UTC), then corrects once. That fails when the naive
// guess itself lands on the wrong side of a same-day DST transition — NZ's
// +12/+13h offset is large enough that a midnight guess formats to *midday*
// local time, which on the rare years the transition falls on the 1st (e.g.
// 2029, 2035) is already past the changeover. Iterating re-measures the
// offset at each improved estimate until it stops moving (converges in 2-3
// passes for any real single-hour DST shift).
function zonedMidnightToUtc(y: number, m: number, d: number, timeZone: string): Date {
  const target = Date.UTC(y, m - 1, d)
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instant))
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
    const hour = map.hour === '24' ? '00' : map.hour
    const asUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(hour), Number(map.minute), Number(map.second))
    return asUtc - instant
  }
  let instant = target
  for (let i = 0; i < 4; i++) {
    const next = target - offsetAt(instant)
    if (next === instant) break
    instant = next
  }
  return new Date(instant)
}
