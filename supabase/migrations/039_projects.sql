-- Projects: multi-stage work spanning many jobs/invoices/subbies (renovation
-- builds, fitouts, etc). Tier-gated behind a 'projects' add-on so smaller
-- service tradies aren't paying for capability they don't use — see
-- companies.addons.

create type project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type project_stage_status as enum ('pending', 'in_progress', 'done');

create table projects (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  customer_id         uuid references customers(id) on delete set null,
  project_manager_id  uuid references profiles(id)  on delete set null,
  name                text not null,
  description         text,
  status              project_status not null default 'planning',
  total_budget        numeric(12,2),
  start_date          date,
  target_end_date     date,
  reference           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index projects_company_id_idx on projects(company_id);
create trigger set_projects_updated_at before update on projects
  for each row execute function set_updated_at();

create table project_stages (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null,
  description     text,
  sort_order      int  not null default 0,
  status          project_stage_status not null default 'pending',
  target_end_date date,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index project_stages_project_idx on project_stages(project_id);
create trigger set_project_stages_updated_at before update on project_stages
  for each row execute function set_updated_at();

create table project_contacts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  role        text,
  phone       text,
  email       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index project_contacts_project_idx on project_contacts(project_id);

create table project_subcontractors (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  trade       text,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index project_subcontractors_project_idx on project_subcontractors(project_id);

-- Link jobs and invoices to a project + (optionally) a specific stage.
alter table jobs     add column project_id       uuid references projects(id)       on delete set null;
alter table jobs     add column project_stage_id uuid references project_stages(id) on delete set null;
alter table invoices add column project_id       uuid references projects(id)       on delete set null;
alter table invoices add column project_stage_id uuid references project_stages(id) on delete set null;
create index jobs_project_idx     on jobs(project_id)     where project_id     is not null;
create index invoices_project_idx on invoices(project_id) where project_id     is not null;

-- Add-ons (Stripe-driven flags). 'projects' = $19/mo add-on on top of Team.
alter table companies add column addons jsonb not null default '{}'::jsonb;
comment on column companies.addons is 'Per-company feature add-ons keyed by add-on slug, e.g. {"projects": {"active": true}}';

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table projects               enable row level security;
alter table project_stages         enable row level security;
alter table project_contacts       enable row level security;
alter table project_subcontractors enable row level security;

create policy "members select projects" on projects
  for select using (company_id = current_company_id());
create policy "admins write projects" on projects
  for all using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());

create policy "members select project_stages" on project_stages
  for select using (project_id in (select id from projects where company_id = current_company_id()));
create policy "admins write project_stages" on project_stages
  for all using (project_id in (select id from projects where company_id = current_company_id() and is_admin_or_owner()))
  with check (project_id in (select id from projects where company_id = current_company_id() and is_admin_or_owner()));

create policy "members select project_contacts" on project_contacts
  for select using (project_id in (select id from projects where company_id = current_company_id()));
create policy "admins write project_contacts" on project_contacts
  for all using (project_id in (select id from projects where company_id = current_company_id() and is_admin_or_owner()))
  with check (project_id in (select id from projects where company_id = current_company_id() and is_admin_or_owner()));

create policy "members select project_subcontractors" on project_subcontractors
  for select using (project_id in (select id from projects where company_id = current_company_id()));
create policy "admins write project_subcontractors" on project_subcontractors
  for all using (project_id in (select id from projects where company_id = current_company_id() and is_admin_or_owner()))
  with check (project_id in (select id from projects where company_id = current_company_id() and is_admin_or_owner()));
