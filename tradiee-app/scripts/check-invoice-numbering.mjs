// Runnable check for the two invoice-numbering/lock triggers added in
// 20260807100000_job_derived_invoice_numbers.sql and
// 20260807110000_lock_invoice_financials_to_draft.sql. Requires LOCAL
// Supabase running (`npx supabase start` from tradiee-app/) — this exercises
// real Postgres triggers, not pure JS, so unlike the other check-*.mjs
// scripts in this folder it can't run standalone.
//
// Run (from tradiee-app/, local Supabase up):
//   SUPABASE_SECRET_KEY=$(npx supabase status -o env | grep ^SECRET_KEY | cut -d'"' -f2) node scripts/check-invoice-numbering.mjs

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

const { data: company, error: coErr } = await sb.from('companies').insert({ name: 'check-invoice-numbering', country: 'NZ', subscription_status: 'active' }).select('id').single()
if (coErr) { console.error('Setup failed — is local Supabase running? (npx supabase start)', coErr.message); process.exit(1) }
const { data: customer } = await sb.from('customers').insert({ company_id: company.id, type: 'commercial', name: 'Test Customer' }).select('id').single()

try {
  // Insert a job — the trigger assigns it a number like J-0001.
  const { data: job, error: jobErr } = await sb.from('jobs').insert({
    company_id: company.id, customer_id: customer.id, job_number: 'PENDING', title: 'Test job', status: 'in_progress',
  }).select('id, job_number').single()
  if (jobErr) throw new Error(`job insert failed: ${jobErr.message}`)
  const jobNumeric = job.job_number.match(/(\d+)$/)[1]

  // First invoice for this job takes the job's own numeric part.
  const { data: inv1, error: inv1Err } = await sb.from('invoices').insert({
    company_id: company.id, customer_id: customer.id, job_id: job.id, invoice_number: 'PENDING',
    subtotal: 100, gst_amount: 15, total: 115, status: 'draft',
  }).select('id, invoice_number').single()
  if (inv1Err) throw new Error(`inv1 insert failed: ${inv1Err.message}`)
  assert(inv1.invoice_number === `INV-${jobNumeric}`, `first invoice number should be INV-${jobNumeric}, got ${inv1.invoice_number}`)

  // Second invoice for the SAME job gets a -1 suffix, third gets -2.
  const { data: inv2 } = await sb.from('invoices').insert({
    company_id: company.id, customer_id: customer.id, job_id: job.id, invoice_number: 'PENDING',
    subtotal: 50, gst_amount: 7.5, total: 57.5, status: 'draft',
  }).select('id, invoice_number').single()
  assert(inv2.invoice_number === `INV-${jobNumeric}-1`, `second invoice number should be INV-${jobNumeric}-1, got ${inv2.invoice_number}`)

  const { data: inv3 } = await sb.from('invoices').insert({
    company_id: company.id, customer_id: customer.id, job_id: job.id, invoice_number: 'PENDING',
    subtotal: 20, gst_amount: 3, total: 23, status: 'draft',
  }).select('id, invoice_number').single()
  assert(inv3.invoice_number === `INV-${jobNumeric}-2`, `third invoice number should be INV-${jobNumeric}-2, got ${inv3.invoice_number}`)

  // A jobless invoice falls back to the ordinary company-wide counter — and
  // must skip "INV-0001" since job #1's own invoice already took it (the
  // collision-safety regression this check exists to catch).
  const { data: invJobless, error: joblessErr } = await sb.from('invoices').insert({
    company_id: company.id, customer_id: customer.id, job_id: null, invoice_number: 'PENDING',
    subtotal: 10, gst_amount: 1.5, total: 11.5, status: 'draft',
  }).select('id, invoice_number').single()
  if (joblessErr) throw new Error(`jobless invoice insert failed (this is the collision bug if company_id/invoice_number already exists): ${joblessErr.message}`)
  assert(/^INV-\d{4}$/.test(invJobless.invoice_number) && invJobless.invoice_number !== inv1.invoice_number,
    `jobless invoice should use the ordinary counter format and not collide with the job-derived one, got ${invJobless.invoice_number}`)

  // ── Financial-lock trigger ─────────────────────────────────────────────
  const { error: draftEditErr } = await sb.from('invoices').update({ discount_type: 'amount', discount_value: 10, discount_amount: 10 }).eq('id', inv1.id)
  assert(!draftEditErr, `draft invoice discount edit should succeed, got: ${draftEditErr?.message}`)

  await sb.from('invoices').update({ status: 'sent' }).eq('id', inv1.id)
  const { error: sentEditErr } = await sb.from('invoices').update({ discount_value: 20 }).eq('id', inv1.id)
  assert(!!sentEditErr, 'editing discount on a sent invoice should be rejected')
  assert(sentEditErr?.message.includes('revert it to draft'), `error should mention reverting to draft, got: ${sentEditErr?.message}`)

  const { error: statusOnlyErr } = await sb.from('invoices').update({ viewed_at: new Date().toISOString() }).eq('id', inv1.id)
  assert(!statusOnlyErr, `non-financial field update on a sent invoice should still succeed, got: ${statusOnlyErr?.message}`)

  const { error: revertErr } = await sb.from('invoices').update({ status: 'draft' }).eq('id', inv1.id)
  assert(!revertErr, `reverting to draft should succeed, got: ${revertErr?.message}`)

  const { error: postRevertEditErr } = await sb.from('invoices').update({ discount_value: 30 }).eq('id', inv1.id)
  assert(!postRevertEditErr, `discount edit after reverting to draft should succeed, got: ${postRevertEditErr?.message}`)

  if (process.exitCode) {
    console.error('FAILED — see above')
  } else {
    console.log('OK — job-derived invoice numbering (base number, -1/-2 suffixes, collision-safe fallback) and the sent-invoice financial lock (blocked, non-financial fields still writable, unlocked by reverting to draft) all verified.')
  }
} finally {
  await sb.from('invoices').delete().eq('company_id', company.id)
  await sb.from('jobs').delete().eq('company_id', company.id)
  await sb.from('customers').delete().eq('id', customer.id)
  await sb.from('companies').delete().eq('id', company.id)
}
