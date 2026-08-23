// Runnable check for two things added together, since one is pointless
// without the other:
//   1. enforce_plan_row_cap() (20260824100000) counting only is_active=true
//      rows for customers/price_list_items — before this fix, archiving a row
//      never freed up cap room, so a company that imported 1000 customers on
//      trial and dropped to free could archive 990 of them and still be
//      permanently blocked from adding an 11th.
//   2. POST /api/billing/free-plan-carryover actually archiving the rows a
//      free-plan company doesn't keep.
//
// Requires LOCAL Supabase running (`npx supabase start` from repo root) and
// the local dev server running (`npm run dev`, port 3000) for part 2 — the
// API route needs a real session cookie, which only a running server can
// issue.
//
// Run (from tradiee-app/, local Supabase + dev server both up):
//   SUPABASE_SECRET_KEY=$(npx supabase status -o env | grep ^SECRET_KEY | cut -d'"' -f2) \
//   SUPABASE_ANON_KEY=$(npx supabase status -o env | grep ^PUBLISHABLE_KEY | cut -d'"' -f2) \
//   node scripts/check-free-plan-carryover.mjs

import { createClient } from '@supabase/supabase-js'

const secretKey = process.env.SUPABASE_SECRET_KEY
const anonKey = process.env.SUPABASE_ANON_KEY
if (!secretKey || !anonKey) {
  console.error('Set SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY to the LOCAL Supabase keys first — see the run command at the top of this file.')
  process.exit(1)
}
const sb = createClient('http://127.0.0.1:54341', secretKey)

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 }
  else console.log('ok:', msg)
}

const email = `check-carryover-${Date.now()}@local.dev`
const password = 'TestPass123!'

async function cleanup(companyId, userId) {
  if (companyId) {
    const { error } = await sb.from('companies').delete().eq('id', companyId)
    if (error) console.error(`cleanup: company delete failed (${companyId}): ${error.message} — delete it manually.`)
  }
  if (userId) {
    const { error } = await sb.auth.admin.deleteUser(userId)
    if (error) console.error(`cleanup: auth user delete failed (${userId}): ${error.message} — delete it manually.`)
  }
}

let companyId, userId
try {
  const { data: authData, error: authError } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
  if (authError) throw new Error(`createUser: ${authError.message}`)
  userId = authData.user.id

  // trial_ends_at in the past + subscription_status trialing => effectivePlanKey() = 'free'.
  const { data: company, error: companyError } = await sb.from('companies')
    .insert({ name: 'Check Carryover Co', subscription_status: 'trialing', subscription_plan: 'trial', trial_ends_at: '2020-01-01T00:00:00Z', country: 'NZ' })
    .select('id').single()
  if (companyError) throw new Error(`company insert: ${companyError.message}`)
  companyId = company.id

  const { error: profileError } = await sb.from('profiles')
    .insert({ id: userId, company_id: companyId, full_name: 'Check Carryover', email, role: 'owner', is_active: true })
  if (profileError) throw new Error(`profile insert: ${profileError.message}`)

  // Simulate "imported 15 customers while still on an active trial" by
  // temporarily lifting trial_ends_at into the future, then dropping it back
  // — same as a real trial lapsing after the data already exists.
  await sb.from('companies').update({ trial_ends_at: '2099-01-01T00:00:00Z' }).eq('id', companyId)
  const customerIds = []
  for (let i = 0; i < 15; i++) {
    const { data, error } = await sb.from('customers').insert({ company_id: companyId, name: `Cust ${i}` }).select('id').single()
    if (error) throw new Error(`customer ${i} insert (during trial): ${error.message}`)
    customerIds.push(data.id)
  }
  await sb.from('companies').update({ trial_ends_at: '2020-01-01T00:00:00Z' }).eq('id', companyId)

  // Part 1: the loophole this migration closes — a new insert must be
  // blocked even though the block is really about the 15 *existing* rows,
  // not the 16th one specifically.
  const { error: blockedError } = await sb.from('customers').insert({ company_id: companyId, name: 'Should be blocked' })
  assert(blockedError?.code === 'P0001', 'new customer insert blocked while 15 active customers sit over the cap of 10')

  // Part 2: call the real API route as this user, same as the browser would.
  const { data: signIn, error: signInError } = await sb.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`sign in: ${signInError.message}`)
  const cookieValue = 'base64-' + Buffer.from(JSON.stringify({
    access_token: signIn.session.access_token, token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: signIn.session.refresh_token, user: {},
  })).toString('base64')

  const keep = customerIds.slice(0, 10)
  const res = await fetch('http://localhost:3000/api/billing/free-plan-carryover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `sb-127-auth-token=${cookieValue}` },
    body: JSON.stringify({ keepCustomerIds: keep }),
  })
  if (!res.ok) throw new Error(`carryover route returned ${res.status}: ${await res.text()} — is the dev server running on :3000?`)

  const { data: active } = await sb.from('customers').select('id').eq('company_id', companyId).eq('is_active', true)
  assert(active?.length === 10, `exactly 10 customers active after carryover (got ${active?.length})`)
  assert(active.every(c => keep.includes(c.id)), 'the 10 active customers are exactly the ones kept')

  const { data: archived } = await sb.from('customers').select('archived_at').eq('company_id', companyId).eq('is_active', false)
  assert(archived?.length === 5, `exactly 5 customers archived (got ${archived?.length})`)
  assert(archived.every(c => !!c.archived_at), 'every archived row has archived_at set')

  // The loophole is fully closed only if the cap now actually reflects
  // reality: still exactly at cap (10 active, cap 10), so still blocked —
  // this is the assertion that would have failed before the is_active fix,
  // since the old trigger counted all 15 regardless of archiving.
  const { error: stillBlockedError } = await sb.from('customers').insert({ company_id: companyId, name: 'Still blocked at cap' })
  assert(stillBlockedError?.code === 'P0001', 'still blocked at exactly 10/10 after carryover (cap is inclusive)')

  // Archive one more manually (simulating the owner deleting a customer) to
  // go under cap, then confirm a new insert succeeds — proves the fix, not
  // just that the cap still exists.
  await sb.from('customers').update({ is_active: false, archived_at: new Date().toISOString() }).eq('id', keep[0])
  const { error: nowAllowedError } = await sb.from('customers').insert({ company_id: companyId, name: 'Allowed under cap' })
  assert(!nowAllowedError, `insert succeeds once active count drops below cap (error: ${nowAllowedError?.message})`)
} finally {
  await cleanup(companyId, userId)
}

if (process.exitCode) console.error('\nFAILED')
else console.log('\nOK — free-plan carryover: is_active-aware cap + archive-the-rest route verified end to end.')
