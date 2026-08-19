-- Cost categories: let a company group job costs (framing, electrical,
-- tiling, site prep, ...) instead of only "material" vs "labour". Mirrors the
-- custom job_statuses pattern (037_custom_job_statuses.sql) — a per-company
-- customisable list, not a fixed enum, with the same members-select/
-- admins-write RLS split.
--
-- Scoped to job_materials only for this pass, not quote_line_items/
-- invoice_line_items/purchase_order_items — see PROJECT_STATE.md for why
-- (keystone for a future "estimate vs actual by category" report, but that
-- report doesn't exist yet, and job_materials is where actual job cost is
-- already tracked today).

create table if not exists cost_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);
create index if not exists cost_categories_company_idx on cost_categories(company_id);

alter table cost_categories enable row level security;
create policy "members select cost_categories" on cost_categories
  for select using (company_id = current_company_id());
create policy "admins write cost_categories" on cost_categories
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- Seed a generic, trade-agnostic starter set for every existing company —
-- this app serves builders and single-trade businesses alike, so the seed
-- avoids builder-specific stages (framing, roofing) in favour of categories
-- that mean something to any trade. A company can rename/reorder/add/delete
-- freely afterwards, same as job_statuses.
insert into cost_categories (company_id, name, sort_order)
select c.id, v.name, v.ord
from companies c
cross join (values
  ('Labour',              0),
  ('Materials',           1),
  ('Subcontractors',      2),
  ('Plant & equipment',   3),
  ('Site costs',          4),
  ('Permits & fees',      5),
  ('Other',               6)
) as v(name, ord)
on conflict (company_id, name) do nothing;

alter table job_materials
  add column if not exists cost_category_id uuid references cost_categories(id) on delete set null;

-- job_materials is SELECT job_materials.* (wildcard) in sync-rules.yaml, so
-- the new column reaches devices automatically — but ADD COLUMN doesn't
-- backfill existing rows through logical replication (the 2026-08-02 outage
-- trap, hit again just yesterday by 20260818100000's own backfill). This one
-- is nullable and every row starts null, so there's nothing to actually
-- populate — the WAL push is still needed so already-synced devices see the
-- column exists at all. job_materials also carries lock_job_materials
-- (block_write_if_job_locked(), live since 2026-08-16), so trigger
-- suppression is required here too, learned the hard way on this exact table
-- less than 24 hours ago — not repeating that mistake a second time.
set local session_replication_role = 'replica';
update job_materials set id = id;
set local session_replication_role = 'origin';
