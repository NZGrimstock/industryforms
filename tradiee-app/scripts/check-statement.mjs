// Runnable check for lib/statement.ts — the Statements page (and the daily
// reminder) both depend on this grouping being right, and it's never been
// exercised against real seeded data in a browser.
//
// Run:  node scripts/check-statement.mjs   (from tradiee-app/)

import assert from 'node:assert/strict'
import { buildCustomerStatements } from '../lib/statement.ts'

const ASOF = new Date('2026-08-06T00:00:00Z')

// ── void and draft invoices never appear on a statement ─────────────────────
{
  const result = buildCustomerStatements([
    { id: '1', customer_id: 'c1', invoice_number: 'INV-1', status: 'void', total: 500, amount_paid: 0, due_date: null, created_at: '2026-07-01' },
    { id: '2', customer_id: 'c1', invoice_number: 'INV-2', status: 'draft', total: 500, amount_paid: 0, due_date: null, created_at: '2026-07-01' },
  ], ASOF)
  assert.equal(result.size, 0, 'void/draft invoices leaked into the statement')
}

// ── fully paid invoices drop out (balance <= 1c) ────────────────────────────
{
  const result = buildCustomerStatements([
    { id: '1', customer_id: 'c1', invoice_number: 'INV-1', status: 'paid', total: 500, amount_paid: 500, due_date: null, created_at: '2026-07-01' },
    { id: '2', customer_id: 'c1', invoice_number: 'INV-2', status: 'paid', total: 500, amount_paid: 499.995, due_date: null, created_at: '2026-07-01' },
  ], ASOF)
  assert.equal(result.size, 0, 'a fully (or effectively) paid invoice should not appear on a statement')
}

// ── Postgres numeric columns arrive as strings ──────────────────────────────
{
  const result = buildCustomerStatements([
    { id: '1', customer_id: 'c1', invoice_number: 'INV-1', status: 'sent', total: '1250.50', amount_paid: '300.25', due_date: null, created_at: '2026-07-01' },
  ], ASOF)
  const c1 = result.get('c1')
  assert.equal(c1.outstanding, 950.25, 'string numeric total/amount_paid were not coerced to numbers')
}

// ── multi-invoice, multi-customer grouping ──────────────────────────────────
{
  const result = buildCustomerStatements([
    { id: '1', customer_id: 'c1', invoice_number: 'INV-1', status: 'sent', total: 1000, amount_paid: 0, due_date: null, created_at: '2026-07-01' },
    { id: '2', customer_id: 'c1', invoice_number: 'INV-2', status: 'overdue', total: 500, amount_paid: 100, due_date: '2026-07-01', created_at: '2026-06-01' },
    { id: '3', customer_id: 'c2', invoice_number: 'INV-3', status: 'sent', total: 200, amount_paid: 0, due_date: null, created_at: '2026-07-01' },
  ], ASOF)
  assert.equal(result.size, 2, 'expected two distinct customers')
  assert.equal(result.get('c1').lines.length, 2, 'c1 should have both its invoices')
  assert.equal(result.get('c1').outstanding, 1400, 'c1 outstanding should sum both invoices')
  assert.equal(result.get('c2').outstanding, 200, 'c2 outstanding should be independent of c1')
}

// ── aging buckets: not-yet-due, 0-30, 31-60, 61-90+ ─────────────────────────
{
  const result = buildCustomerStatements([
    // no due_date at all -> treated as "current" (agingDays = -1)
    { id: '1', customer_id: 'c1', invoice_number: 'INV-1', status: 'sent', total: 100, amount_paid: 0, due_date: null, created_at: '2026-08-01' },
    // due today -> current (agingDays = 0)
    { id: '2', customer_id: 'c1', invoice_number: 'INV-2', status: 'sent', total: 200, amount_paid: 0, due_date: '2026-08-06', created_at: '2026-07-06' },
    // due 15 days ago -> 0-30 bucket
    { id: '3', customer_id: 'c1', invoice_number: 'INV-3', status: 'overdue', total: 300, amount_paid: 0, due_date: '2026-07-22', created_at: '2026-06-22' },
    // exactly 30 days overdue -> still 0-30 bucket (boundary)
    { id: '4', customer_id: 'c1', invoice_number: 'INV-4', status: 'overdue', total: 400, amount_paid: 0, due_date: '2026-07-07', created_at: '2026-06-07' },
    // exactly 31 days overdue -> 31-60 bucket (boundary)
    { id: '5', customer_id: 'c1', invoice_number: 'INV-5', status: 'overdue', total: 500, amount_paid: 0, due_date: '2026-07-06', created_at: '2026-06-06' },
    // 91+ days overdue -> 90+ bucket
    { id: '6', customer_id: 'c1', invoice_number: 'INV-6', status: 'overdue', total: 600, amount_paid: 0, due_date: '2026-04-01', created_at: '2026-03-01' },
  ], ASOF)
  const c1 = result.get('c1')
  assert.equal(c1.current, 300, 'current bucket should be the no-due-date + due-today invoices (100 + 200)')
  assert.equal(c1.d30, 700, '0-30 bucket should be the 15-day and exactly-30-day invoices (300 + 400)')
  assert.equal(c1.d60, 500, '31-60 bucket should hold the exactly-31-day invoice')
  assert.equal(c1.d90, 600, '90+ bucket should hold the far-overdue invoice')
  assert.equal(c1.outstanding, 300 + 700 + 500 + 600, 'bucket totals must sum to outstanding')
}

console.log('OK — lib/statement.ts verified (void/draft exclusion, paid-off exclusion, numeric coercion, multi-customer grouping, aging buckets).')
