// Runnable check for the pure-logic pieces of lib/xero.ts — the rest of the
// sync flow needs a live Xero org to exercise. Regression guard for two real
// bugs: hardcoded OUTPUT2 breaking AU orgs / ignoring per-line tax rate, and
// incomplete backslash escaping in the contact-name where-clause filter.
//
// Run:  node scripts/check-xero.mjs   (from tradiee-app/)

import assert from 'node:assert/strict'
import { pickXeroTaxType, xeroWhereNameClause } from '../lib/xero.ts'

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

// ── contact-name where-clause escaping ──────────────────────────────────────
assert.equal(xeroWhereNameClause('Alpha Builders'), 'Name=="Alpha Builders"', 'plain name should pass through unescaped')
assert.equal(xeroWhereNameClause('O\'Brien Plumbing'), 'Name=="O\'Brien Plumbing"', 'apostrophes need no escaping inside a double-quoted literal')
assert.equal(xeroWhereNameClause('Bob "Sparky" Smith'), 'Name=="Bob \\"Sparky\\" Smith"', 'embedded double quotes must be escaped so they cannot close the literal early')
// A name ending in a bare backslash: escaping order matters here. If the
// backslash isn't escaped to \\ before the closing quote is appended, the
// backslash pairs with the closing quote's own escaping and the literal
// never actually closes in Xero's where-clause grammar.
assert.equal(xeroWhereNameClause('Smith \\'), 'Name=="Smith \\\\"', 'a trailing backslash must be escaped before the closing quote is added')

console.log('OK — lib/xero.ts pure logic verified (tax type matching: exact match, float tolerance, zero-rate handling, safe fallback; where-clause escaping: quotes and backslashes).')
