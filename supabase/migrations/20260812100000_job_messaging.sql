-- Admin ↔ technician job messaging, built on job_notes rather than a new table.
--
-- See JOB_MESSAGING_SCOPE.md for the full reasoning. Short version: job_notes
-- already has the exact shape needed (job_id, author_id, body, created_at), is
-- already in the `powersync` publication and in BOTH sync-rules.yaml streams,
-- is already in both apps' PowerSync client schemas, and its RLS already scopes
-- SELECT to owner/admin-or-assignee (migration 20260701082916) with INSERT open
-- to any company member (002_rls_policies.sql:162) — which is precisely the
-- visibility and write access a per-job thread wants. A new table would have
-- meant redoing all of that, including the publication add + backfill whose
-- omission caused the 2026-08-02 sync outage.

alter table job_notes
  add column if not exists kind text not null default 'note';

-- 'note'    — durable job record. Appears on the job-sheet PDF (unchanged).
-- 'message' — admin↔technician conversation. Push-notified, and deliberately
--             excluded from the job sheet so chatter can't reach a printed doc.
alter table job_notes drop constraint if exists job_notes_kind_check;
alter table job_notes add constraint job_notes_kind_check
  check (kind in ('note', 'message'));

create index if not exists job_notes_job_kind_idx
  on job_notes(job_id, kind, created_at desc);

-- ⚠ Force existing rows back through the WAL so PowerSync picks up the new
-- column. `ALTER TABLE ... ADD COLUMN` does NOT re-emit existing rows to
-- logical replication (the same trap as adding a table to a publication
-- without backfilling — see PROJECT_STATE.md, 2026-08-02), so without this
-- every already-synced job_notes row would reach devices with no `kind` at
-- all and a `kind = 'note'` filter would silently match nothing.
--
-- Safe to run as a plain UPDATE (unlike the 2026-08-02 fix, which needed
-- session_replication_role='replica'): job_notes has no updated_at column, so
-- there is no timestamp to falsely bump. It DOES carry one trigger —
-- `set_company_id` (migration 022), BEFORE INSERT OR UPDATE, which re-derives
-- company_id from the parent job — but that is idempotent and writes the same
-- value it already holds, so firing it on every row here is harmless.
update job_notes set id = id;
