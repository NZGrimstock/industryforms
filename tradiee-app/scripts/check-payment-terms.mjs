// Runnable check for the invoice due_date trigger added in
// 20260816120000_payment_terms.sql. Requires LOCAL Supabase running
// (`npx supabase start` from repo root) — exercises the real Postgres
// trigger, not pure JS.
//
// Run (from tradiee-app/, local Supabase up):
//   SUPABASE_SECRET_KEY=$(npx supabase status -o env | grep ^SECRET_KEY | cut -d'"' -f2) node scripts/check-payment-terms.mjs

import { createClient } from '@supabase/supabase-js'

const secretKey = process.env.SUPABASE_SECRET_KEY
if (!secretKey) {
  console.error('Set SUPABASE_SECRET_KEY to the LOCAL Supabase service-role key first — see the run command at the top of this file.')
  process.exit(1)
}
const sb = createClient('http://127.0.0.1:54341', secretKey)

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 }
}

async function invoice(companyId, customerId, invoiceDate, dueDate) {
  const { data, error } = await sb.from('invoices').insert({
    company_id: companyId, customer_id: customerId, invoice_number: `PENDING-${Math.random()}`,
    subtotal: 100, gst_amount: 15, total: 115, status: 'draft',
    invoice_date: invoiceDate, due_date: dueDate ?? null,
  }).select('id, due_date').single()
  if (error) throw new Error(`invoice insert failed: ${error.message}`)
  return data
}

const { data: company, error: coErr } = await sb.from('companies')
  .insert({ name: 'check-payment-terms', country: 'NZ', subscription_status: 'active', payment_terms_type: 'net_days', payment_terms_days: 14 })
  .select('id').single()
if (coErr) { console.error('Setup failed — is local Supabase running? (npx supabase start)', coErr.message); process.exit(1) }

try {
  const { data: custDefault } = await sb.from('customers').insert({ company_id: company.id, type: 'commercial', name: 'Inherits default' }).select('id').single()
  const { data: custOnReceipt } = await sb.from('customers').insert({ company_id: company.id, type: 'commercial', name: 'On receipt', payment_terms_type: 'on_receipt' }).select('id').single()
  const { data: custDom } = await sb.from('customers').insert({ company_id: company.id, type: 'commercial', name: 'Day of month', payment_terms_type: 'day_of_month', payment_terms_day_of_month: 20 }).select('id').single()
  const { data: custDomClamp } = await sb.from('customers').insert({ company_id: company.id, type: 'commercial', name: 'Day of month clamp', payment_terms_type: 'day_of_month', payment_terms_day_of_month: 31 }).select('id').single()
  const { data: custNet7 } = await sb.from('customers').insert({ company_id: company.id, type: 'commercial', name: '7 day account', payment_terms_type: 'net_days', payment_terms_days: 7 }).select('id').single()

  // No customer override — falls back to the company default (net 14).
  const invDefault = await invoice(company.id, custDefault.id, '2026-08-16')
  assert(invDefault.due_date === '2026-08-30', `company default net_days=14 should give 2026-08-30, got ${invDefault.due_date}`)

  // Customer override beats the company default.
  const invOnReceipt = await invoice(company.id, custOnReceipt.id, '2026-08-16')
  assert(invOnReceipt.due_date === '2026-08-16', `on_receipt should give the invoice date itself, got ${invOnReceipt.due_date}`)

  const invNet7 = await invoice(company.id, custNet7.id, '2026-08-16')
  assert(invNet7.due_date === '2026-08-23', `net_days=7 should give 2026-08-23, got ${invNet7.due_date}`)

  // "Due the 20th of the following month" — invoiced any day in August, due
  // 20 September, regardless of which day in August it was invoiced.
  const invDomEarly = await invoice(company.id, custDom.id, '2026-08-01')
  assert(invDomEarly.due_date === '2026-09-20', `day_of_month=20 invoiced Aug 1 should give 2026-09-20, got ${invDomEarly.due_date}`)
  const invDomLate = await invoice(company.id, custDom.id, '2026-08-31')
  assert(invDomLate.due_date === '2026-09-20', `day_of_month=20 invoiced Aug 31 should also give 2026-09-20, got ${invDomLate.due_date}`)

  // Clamp: day 31 doesn't exist in February (2026 is not a leap year) — must
  // clamp to the last real day of that month, not overflow into March.
  const invDomClamp = await invoice(company.id, custDomClamp.id, '2026-01-15')
  assert(invDomClamp.due_date === '2026-02-28', `day_of_month=31 invoiced in January should clamp to 2026-02-28, got ${invDomClamp.due_date}`)

  // A caller-supplied due_date is respected, not overwritten by the trigger.
  const invExplicit = await invoice(company.id, custDefault.id, '2026-08-16', '2026-12-25')
  assert(invExplicit.due_date === '2026-12-25', `explicit due_date should be left alone, got ${invExplicit.due_date}`)

  if (process.exitCode) {
    console.error('FAILED — see above')
  } else {
    console.log('OK — invoice due_date trigger verified: company default, customer override, on_receipt, net_days, day_of_month (including next-month + last-day clamp), and explicit due_date passthrough.')
  }
} finally {
  await sb.from('invoices').delete().eq('company_id', company.id)
  await sb.from('customers').delete().eq('company_id', company.id)
  await sb.from('companies').delete().eq('id', company.id)
}
