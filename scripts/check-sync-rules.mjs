// Access-control check for the PowerSync sync rules.
//
// Sync rules are a real authorization boundary, separate from RLS: they decide
// which rows are pushed into each device's local SQLite replica. A query that
// forgets to scope by the requesting user returns those rows to *every* device.
//
// Run:  node scripts/check-sync-rules.mjs
// Exits non-zero on a scoping regression. Cheap enough to run in CI.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const rules = readFileSync(join(repoRoot, 'sync-rules.yaml'), 'utf8')
const migration022 = readFileSync(
  join(repoRoot, 'supabase/migrations/022_powersync_company_id.sql'),
  'utf8'
)

// ── Parse ───────────────────────────────────────────────────────────────────
// The file is flat enough that a line scan beats pulling in a YAML dependency.
// Query lines are the `- SELECT …` entries under a stream's `queries:`.
const queries = rules
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => /^-\s+SELECT\b/i.test(l))
  .map(l => l.replace(/^-\s+/, ''))

assert.ok(queries.length > 20, `expected the full stream set, parsed ${queries.length}`)

// ── 1. Every query must be scoped to the requesting user ────────────────────
// In sync-rules edition 3 the only trustworthy identity is auth.user_id(), read
// from the validated Supabase JWT. A query with no reference to it is either
// company-wide-for-everyone or global — both are cross-user leaks.
const unscoped = queries.filter(q => !q.includes('auth.user_id()'))
assert.deepEqual(
  unscoped,
  [],
  `sync-rules queries with no auth.user_id() scope:\n  ${unscoped.join('\n  ')}`
)

// ── 2. Company-wide streams must also be role-gated ─────────────────────────
// A query that reaches every row of a table for the whole company (the
// `profiles.company_id = X.company_id` join shape) is only correct for
// owner/admin, or for the staff reference data that migration 031 leaves
// company-wide. Anything joining profiles on company_id without naming a role
// hands the full company dataset to field staff.
const companyWide = queries.filter(q => /profiles\.company_id\s*=/.test(q))
const roleless = companyWide.filter(q => !/profiles\.role\s*=/.test(q))
assert.deepEqual(
  roleless,
  [],
  `company-wide sync-rules queries with no role gate:\n  ${roleless.join('\n  ')}`
)

// ── 3. Staff must never receive financial/sales tables ──────────────────────
// Mirrors migration 031, which makes quotes, invoices, payments and enquiries
// owner/admin-only. RLS bounds the API; only this bounds the local replica.
const ADMIN_ONLY = [
  'quotes', 'quote_sections', 'quote_line_items',
  'invoices', 'invoice_line_items', 'enquiries', 'customer_messages',
]
for (const table of ADMIN_ONLY) {
  const touching = queries.filter(q => new RegExp(`FROM\\s+${table}\\b`).test(q))
  assert.ok(touching.length > 0, `${table} is in the client schema but no stream syncs it`)
  for (const q of touching) {
    assert.match(
      q,
      /profiles\.role = 'owner' OR profiles\.role = 'admin'/,
      `${table} is owner/admin-only per migration 031 but this stream is not role-gated:\n  ${q}`
    )
  }
}

// ── 4. Publication drift ────────────────────────────────────────────────────
// PowerSync can only evaluate a stream over tables in the `powersync` logical-
// replication publication. Rules and publication drifting apart is what caused
// the 2026-08-02 outage. Fails closed (missing tables sync nothing rather than
// too much), but a silently half-syncing device is still a bug.
//
// The publication's table list accumulates across the whole migration
// sequence, not just migration 022 (which only creates it), so this has to
// read every migration, not one file. Two shapes appear in practice:
//   - a plain `alter publication powersync add table [public.]name;`
//     statement (e.g. supabase/migrations/20260701*_secondary_assignee_*.sql)
//   - a PL/pgSQL DO block that loops a `wanted := array[...]` table list and
//     adds each one via `execute format(...)` — used by migrations that need
//     to be safe to run against a publication in an unknown prior state (e.g.
//     supabase/migrations/20260805*_powersync_publication_full_table_list.sql,
//     mirroring the idempotent supabase/powersync-publication.sql script).
//     The table names never appear next to the literal words "add table" in
//     this shape, so they're picked up from the `wanted` array instead.
const migrationsDir = join(repoRoot, 'supabase/migrations')
const published = new Set(
  (migration022.split(/create publication powersync for table/i)[1]?.split(';')[0] ?? '')
    .split(',').map(t => t.trim()).filter(Boolean)
)
for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  for (const m of sql.matchAll(/alter\s+publication\s+powersync\s+add\s+table\s+(?:public\.)?([a-z_]+)/gi)) {
    published.add(m[1])
  }
  const wanted = sql.match(/wanted\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/i)
  if (wanted) {
    for (const m of wanted[1].matchAll(/'([a-z_]+)'/g)) published.add(m[1])
  }
}

const referenced = new Set()
for (const q of queries) {
  for (const m of q.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/gi)) referenced.add(m[1])
}

const missing = [...referenced].filter(t => !published.has(t)).sort()
assert.deepEqual(
  missing,
  [],
  `tables used by sync-rules.yaml but absent from the powersync publication ` +
  `across all migrations — sync rules cannot evaluate over them:\n  ${missing.join(', ')}`
)

console.log(`OK — ${queries.length} sync-rules queries, all user-scoped and role-gated.`)
