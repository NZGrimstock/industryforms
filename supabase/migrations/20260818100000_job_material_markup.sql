-- Per-item markup on job materials: an admin/owner can set a markup % on an
-- individual job line item, gated behind a new company-wide toggle (off by
-- default) so companies that don't want it see no change at all. Distinct
-- from the existing companies.standard_markup_enabled/pct, which is a
-- one-shot "fill in a blank sell price from cost" convenience computed
-- inline in the app (lib/plans.ts has no equivalent here — see
-- job_material_markup_enabled below); this is a real per-line value stored
-- against the row, visible and adjustable on its own.

alter table companies
  add column if not exists job_material_markup_enabled boolean not null default false;
comment on column companies.job_material_markup_enabled is
  'Lets an owner/admin set a markup % on an individual job material line (separate from standard_markup_enabled, which only auto-fills a blank sell price).';

alter table job_materials
  add column if not exists markup_pct numeric(6,2);
comment on column job_materials.markup_pct is
  'Optional per-line markup %, admin/owner-set. When present, unit_price = unit_cost * (1 + markup_pct/100), computed client-side at entry time (not a generated column, matching how unit_price is always just stored, never recomputed server-side).';

-- job_materials is SELECT job_materials.* (wildcard) in both sync-rules.yaml
-- streams, so the new column reaches devices automatically going forward —
-- but ALTER TABLE ADD COLUMN does not backfill existing rows through logical
-- replication (the 2026-08-02 outage trap). Force existing rows through the WAL.
--
-- NOT a plain UPDATE: job_materials has carried lock_job_materials
-- (block_write_if_job_locked(), from 20260815100000, live in production since
-- 2026-08-16) since before this migration was written — this file's original
-- comment claimed "no triggers to worry about", which was only ever checked
-- against the updated_at-bumping class of trigger and missed this one
-- entirely. A bare backfill UPDATE against a real production job that's
-- already fully invoiced and locked hard-fails the whole migration (caught by
-- `supabase db push --linked` refusing to apply, not by local dev, which had
-- no locked jobs yet to trip it on). This backfill touches no user-visible
-- data, so suppressing triggers for it is correct, matching the jobs backfill
-- in 20260815100000 itself.
set local session_replication_role = 'replica';
update job_materials set id = id;
set local session_replication_role = 'origin';
