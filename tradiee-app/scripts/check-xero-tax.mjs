// Runnable check for pickXeroTaxType() in lib/xero.ts — the only pure-logic
// piece of the Xero sync fix (the rest needs a live Xero org to exercise).
// Regression guard for the "hardcoded OUTPUT2 breaks AU orgs and ignores
// per-line tax rate" bug this replaced.
//
// Run:  node scripts/check-xero-tax.mjs   (from tradiee-app/)

import assert from 'node:assert/strict'
import { pickXeroTaxType } from '../lib/xero.ts'

const NZ_RATES = [
  { TaxType: 'OUTPUT2', DisplayTaxRate: 15 },
  { TaxType: 'ZERORATED', DisplayTaxRate: 0 },
  { TaxType: 'EXEMPTOUTPUT', DisplayTaxRate: 0 },
]

const AU_RATES = [
  { TaxType: 'OUTPUT', DisplayTaxRate: 10 },
  { TaxType: 'GSTFREEOUTPUT', DisplayTaxRate: 0 },
]

// ── exact rate match wins, regardless of org ────────────────────────────────
assert.equal(pickXeroTaxType(NZ_RATES, 15), 'OUTPUT2', 'NZ 15% line should match OUTPUT2')
assert.equal(pickXeroTaxType(AU_RATES, 10), 'OUTPUT', 'AU 10% line should match OUTPUT, not a hardcoded NZ code')

// ── floating point tolerance (0.15 * 100 can land on 14.999999999999998) ───
assert.equal(pickXeroTaxType(NZ_RATES, 14.999999999999998), 'OUTPUT2', 'floating-point-adjacent rates must still match')

// ── zero-rate lines get the org's zero-rate type, not the standard one ─────
assert.equal(pickXeroTaxType(NZ_RATES, 0), 'ZERORATED', 'NZ 0% line should not be taxed at the standard rate')
assert.equal(pickXeroTaxType(AU_RATES, 0), 'GSTFREEOUTPUT', 'AU 0% line should not be taxed at the standard rate')

// ── no exact match: falls back sanely instead of throwing ──────────────────
assert.equal(pickXeroTaxType(NZ_RATES, 0), NZ_RATES.find(r => r.DisplayTaxRate === 0).TaxType, 'zero fallback should pick a real zero-rate type')
assert.equal(pickXeroTaxType(NZ_RATES, 7.5), 'OUTPUT2', 'an unconfigured custom rate should fall back to the first revenue rate rather than erroring')
assert.equal(pickXeroTaxType([], 15), 'NONE', 'an org with no matching revenue rates at all must not throw')

console.log('OK — pickXeroTaxType verified (exact match, float tolerance, zero-rate handling, safe fallback).')
