// Runnable check for the Jobs list "To Invoice" / "Invoiced in Full" split
// (lib/job-financials.ts: jobInvoicingBucket, actualsJobCeiling).
//
// Run:  node scripts/check-job-invoicing-bucket.mjs   (from tradiee-app/)
// Exits non-zero on a regression.

import assert from 'node:assert/strict'
import { jobInvoicingBucket, actualsJobCeiling } from '../lib/job-financials.ts'

// ── Zero-value job, never invoiced: "to invoice", not vacuously "full" ──────
// User-confirmed rule: a completed job with nothing owed and zero invoices
// ever sent still needs a tradie's attention, not a silent "done".
{
  const bucket = jobInvoicingBucket({ ceiling: 0, invoiced: 0, invoiceCount: 0 })
  assert.equal(bucket, 'to-invoice', 'a completed job with no invoice at all must read "to invoice" even at $0 owed')
}

// ── Fully invoiced ───────────────────────────────────────────────────────
{
  const bucket = jobInvoicingBucket({ ceiling: 500, invoiced: 500, invoiceCount: 1 })
  assert.equal(bucket, 'invoiced-in-full')
}

// ── Partially invoiced — still owing ─────────────────────────────────────
{
  const bucket = jobInvoicingBucket({ ceiling: 500, invoiced: 200, invoiceCount: 1 })
  assert.equal(bucket, 'to-invoice')
}

// ── Void invoice only (invoiced=0 after exclusion) but invoiceCount>0 still
// counts as "an invoice was created" — voiding one shouldn't reset the job
// to looking untouched; it's "to invoice" via the balance check, not $0-ceiling.
{
  const bucket = jobInvoicingBucket({ ceiling: 500, invoiced: 0, invoiceCount: 1 })
  assert.equal(bucket, 'to-invoice')
}

// ── actualsJobCeiling: GST-inclusive reconstruction matches the invoice fix ──
{
  const lines = [{ quantity: 1, unit_price: 5 }, { quantity: 1, unit_price: 5 }]
  assert.equal(actualsJobCeiling(lines, 0.15, true), 10, 'GST-inclusive entry must reconstruct to $10, mirrors the actuals-GST fix')
  assert.equal(actualsJobCeiling(lines, 0.15, false), 11.5, 'GST-exclusive entry: GST still added once on top')
  assert.equal(actualsJobCeiling([], 0.15, true), 0, 'no logged materials/labour — ceiling is 0, not NaN')
}

console.log('OK — jobInvoicingBucket / actualsJobCeiling verified (Jobs list To Invoice / Invoiced in Full split).')
