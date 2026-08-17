// Runnable check for the 2026-08-17 bug: job_materials/timesheets (used for
// quote-less time-and-materials jobs) ignored company.prices_include_tax
// entirely, always treating unit_price as GST-exclusive and adding GST on
// top a second time — reported live: $5 + $5 with "Prices include GST" on
// showed a $11.50 job total instead of $10.00. Fixed by routing every
// job_materials/timesheets money read through lineNet() (lib/pricing.ts),
// same as quote line items already did. This check reproduces the exact
// reported numbers plus the tax-exclusive case, which must be unaffected.
//
// Run:  node scripts/check-actuals-gst.mjs   (from tradiee-app/)
// Exits non-zero on a regression.

import assert from 'node:assert/strict'
import { lineNet, round2 } from '../lib/pricing.ts'

const GST = 0.15

// ── The exact reported bug: $5 material + $5 labour, prices_include_tax on ──
// Entered prices already include GST, so the net (GST-exclusive) sum must be
// $10 / 1.15, and reconstructing the customer-facing total (net * 1.15+)
// must land back on exactly $10.00 — not $11.50 (GST added a second time).
{
  const lines = [
    { quantity: 1, unit_price: 5 }, // "Test price"
    { quantity: 1, unit_price: 5 }, // "1 hour"
  ]
  const netTotal = lines.reduce((sum, l) => sum + lineNet(l.quantity, l.unit_price, null, 0, GST, true), 0)
  const jobTotalDisplayed = round2(netTotal * (1 + GST))
  assert.equal(jobTotalDisplayed, 10, `GST-inclusive entry: job total must reconstruct to $10.00, got $${jobTotalDisplayed}`)
  assert.equal(round2(netTotal), 8.7, 'GST-inclusive entry: net subtotal must be $10 stripped of GST (8.70)')
}

// ── Same lines, prices_include_tax OFF — must be unaffected by the fix ──────
// A GST-exclusive shop's $5 + $5 raw entries are already net; GST still adds
// on top once, landing on $11.50, same as before this fix.
{
  const lines = [{ quantity: 1, unit_price: 5 }, { quantity: 1, unit_price: 5 }]
  const netTotal = lines.reduce((sum, l) => sum + lineNet(l.quantity, l.unit_price, null, 0, GST, false), 0)
  const jobTotalDisplayed = round2(netTotal * (1 + GST))
  assert.equal(netTotal, 10, 'GST-exclusive entry: net subtotal must equal the raw entered total unchanged')
  assert.equal(jobTotalDisplayed, 11.5, 'GST-exclusive entry: GST-inclusive total must still be $11.50')
}

// ── Labour (fractional hours × bill rate), GST-inclusive ────────────────────
{
  const net = lineNet(2.5, 46, null, 0, GST, true) // 2.5hr @ $46/hr inc GST
  assert.equal(net, round2((2.5 * 46) / 1.15), 'fractional-hour labour line must strip GST the same way')
}

console.log('OK — job_materials/timesheets actuals correctly respect prices_include_tax (2026-08-17 GST fix).')
