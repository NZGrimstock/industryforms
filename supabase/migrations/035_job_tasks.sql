-- Per-job task checklist (Tradify "Job Tasks"): lightweight to-do items attached
-- to a job, distinct from the company-wide To-Do list.
create table if not exists job_tasks (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references jobs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  title      text not null,
  is_done    boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists job_tasks_job_idx on job_tasks(job_id);

alter table job_tasks enable row level security;

-- Visible/editable when the parent job is visible to the user (role-scoped, in
-- line with migration 031: staff see only their assigned jobs).
create policy "members select job_tasks" on job_tasks
  for select using (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ));
create policy "members write job_tasks" on job_tasks
  for all using (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  )) with check (job_id in (
    select id from jobs where company_id = current_company_id()
    and (is_admin_or_owner() or assigned_to = auth.uid())
  ));
