// Runnable check for the customer/job financial-summary math
// (lib/job-financials.ts, lib/financial-year.ts) — never exercised against
// real seeded data in a browser, so this is the only automated backstop.
//
// Run:  node scripts/check-job-financials.mjs   (from tradiee-app/)
// Exits non-zero on a regression.

import assert from 'node:assert/strict'
import { summarizeInvoices, jobTotal, toInvoice } from '../lib/job-financials.ts'
import { currentFinancialYearStart } from '../lib/financial-year.ts'

// ── summarizeInvoices: void exclusion ───────────────────────────────────────
{
  const { invoiced, paid, outstanding } = summarizeInvoices([
    { status: 'sent', total: 1000, amount_paid: 400 },
    { status: 'paid', total: 500, amount_paid: 500 },
    { status: 'void', total: 99999, amount_paid: 99999 }, // must be fully ignored
  ])
  assert.equal(invoiced, 1500, 'void invoice leaked into invoiced total')
  assert.equal(paid, 900, 'void invoice leaked into paid total')
  assert.equal(outstanding, 600, 'outstanding should be invoiced - paid, void excluded')
}

// ── summarizeInvoices: Postgres numeric columns arrive as strings ──────────
// supabase-js returns `numeric` columns as strings, not numbers. Number()
// coercion has to happen or "125" + "300" silently string-concatenates.
{
  const { invoiced, paid } = summarizeInvoices([
    { status: 'sent', total: '1250.50', amount_paid: '300.25' },
    { status: 'sent', total: '99.50', amount_paid: '0' },
  ])
  assert.equal(invoiced, 1350, 'string numeric totals were not coerced to numbers')
  assert.equal(paid, 300.25, 'string numeric amount_paid was not coerced to numbers')
}

// ── jobTotal: quote ceiling vs time-and-materials fallback ─────────────────
{
  assert.equal(jobTotal(2000, 500), 2000, 'quoted job should use the quote total as its ceiling')
  assert.equal(jobTotal('2000.00', 500), 2000, 'string (Postgres numeric) quote total should coerce')
  assert.equal(jobTotal(null, 500), 500, 'no-quote job should fall back to invoiced, not guess a total')
  assert.equal(jobTotal(undefined, 500), 500, 'undefined quote total should also fall back to invoiced')
}

// ── toInvoice: floors at zero, never goes negative ──────────────────────────
{
  assert.equal(toInvoice(1000, 400), 600, 'normal case: total minus invoiced')
  assert.equal(toInvoice(1000, 1000), 0, 'fully invoiced should read exactly 0')
  assert.equal(toInvoice(1000, 1400), 0, 'over-invoiced must floor at 0, not go negative')
  // The documented no-quote path: jobTotal falls back to `invoiced`, so
  // toInvoice(invoiced, invoiced) must always be exactly 0, never negative
  // rounding noise.
  assert.equal(toInvoice(jobTotal(null, 733.33), 733.33), 0, 'no-quote job must read $0 to invoice, not a rounding artifact')
}

// ── financial-year: NZ (April) boundary is DST-active every year ───────────
// NZDT doesn't end until the first Sunday of April, which is always on or
// after April 1 — so NZ's FY-start local midnight is always +13, never +12.
// Pin the exact UTC instant so a regression to a fixed offset is caught.
{
  const start = currentFinancialYearStart(new Date('2026-05-15T00:00:00Z'), 'NZ', 'Pacific/Auckland')
  assert.equal(start.toISOString(), '2026-03-31T11:00:00.000Z', 'NZ FY start should be 2026-04-01 00:00 NZDT (+13)')
}

// ── financial-year: hardest NZ edge case — the DST transition IS April 1 ───
// In 2029, the first Sunday of April falls ON April 1 itself. The switch to
// NZST happens at 3am that day, so local midnight (the FY start instant) is
// still on the DST side, same calendar date as the transition.
{
  const start = currentFinancialYearStart(new Date('2029-04-01T20:00:00Z'), 'NZ', 'Pacific/Auckland')
  assert.equal(start.toISOString(), '2029-03-31T11:00:00.000Z', '2029-04-01 00:00 local must still resolve to NZDT (+13), not NZST')
}

// ── financial-year: AU (July) boundary sits in winter — no DST at all ──────
// Complements the NZ case above: AU's FY start is on the *other* side of the
// DST/standard-time line (a fixed +10, no daylight saving in July).
{
  const start = currentFinancialYearStart(new Date('2026-08-15T00:00:00Z'), 'AU', 'Australia/Sydney')
  assert.equal(start.toISOString(), '2026-06-30T14:00:00.000Z', 'AU FY start should be 2026-07-01 00:00 AEST (+10)')
}

// ── financial-year: month-boundary year selection, both countries ──────────
{
  const beforeNz = currentFinancialYearStart(new Date('2026-03-20T00:00:00Z'), 'NZ', 'Pacific/Auckland')
  assert.equal(beforeNz.toISOString(), '2025-03-31T11:00:00.000Z', 'before 1 April should still be in the prior NZ financial year')

  const beforeAu = currentFinancialYearStart(new Date('2026-06-15T00:00:00Z'), 'AU', 'Australia/Sydney')
  assert.equal(beforeAu.toISOString(), '2025-06-30T14:00:00.000Z', 'before 1 July should still be in the prior AU financial year')
}

// ── financial-year: round-trip sanity — whatever instant comes back must ───
// actually format as local midnight in its own timezone, independent of any
// hardcoded offset assumption above.
{
  for (const [country, tz] of [['NZ', 'Pacific/Auckland'], ['AU', 'Australia/Sydney']]) {
    const start = currentFinancialYearStart(new Date(), country, tz)
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(start)
    assert.equal(local, '00:00:00', `${country} FY start instant does not round-trip to local midnight in ${tz}`)
  }
}

console.log('OK — job-financials.ts and financial-year.ts math verified (void exclusion, numeric coercion, quote fallback, floor-at-zero, NZ/AU DST FY boundaries).')
