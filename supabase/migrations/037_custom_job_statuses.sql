-- Custom job statuses: let companies define their own job statuses (rename,
-- recolour, reorder, add). jobs.status becomes free text (existing enum values
-- are preserved) and a per-company job_statuses table holds the allowed set.

-- 1) Convert jobs.status from the enum to text (keep current values + default).
alter table jobs alter column status drop default;
alter table jobs alter column status type text using status::text;
alter table jobs alter column status set default 'unscheduled';
-- (the job_status enum type is left in place but unused — dropping it is avoided
--  to sidestep any lingering dependencies.)

-- 2) Per-company status definitions.
create table if not exists job_statuses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  key         text not null,                 -- stored on jobs.status
  label       text not null,
  color       text not null default 'gray',  -- token: gray|blue|orange|yellow|green|red|purple|teal|pink
  sort_order  integer not null default 0,
  is_terminal boolean not null default false, -- completed/cancelled-style (closed)
  created_at  timestamptz not null default now(),
  unique (company_id, key)
);
create index if not exists job_statuses_company_idx on job_statuses(company_id);

alter table job_statuses enable row level security;
create policy "members select job_statuses" on job_statuses
  for select using (company_id = current_company_id());
create policy "admins write job_statuses" on job_statuses
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

-- 3) Seed the six defaults for every existing company.
insert into job_statuses (company_id, key, label, color, sort_order, is_terminal)
select c.id, v.key, v.label, v.color, v.ord, v.terminal
from companies c
cross join (values
  ('unscheduled', 'Unscheduled', 'gray',   0, false),
  ('scheduled',   'Scheduled',   'blue',   1, false),
  ('in_progress', 'In progress', 'orange', 2, false),
  ('on_hold',     'On hold',     'yellow', 3, false),
  ('completed',   'Completed',   'green',  4, true),
  ('cancelled',   'Cancelled',   'red',    5, true)
) as v(key, label, color, ord, terminal)
on conflict (company_id, key) do nothing;
