-- Persists the takeoff tool's output against a job: the plan image plus
-- calibration and every measurement taken from it. Previously (2026-08-20,
-- earlier this session) the takeoff tool was a standalone, purely
-- client-side page with nothing saved — this is the deliberate follow-up
-- that attaches it to a job, per direct request. The tool itself moves from
-- a standalone /takeoff page to a card on the job detail page, mirroring
-- job_diary_entries/variations (both added earlier today).
--
-- Web only for this pass, matching the standalone tool's own scope — not
-- synced via PowerSync. Mobile takeoff is a real follow-up, not attempted.

create table if not exists job_plans (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs(id) on delete cascade,
  company_id       uuid not null references companies(id) on delete cascade,
  name             text not null default 'Plan',
  image_url        text not null,
  -- Natural (unscaled) pixel dimensions of the uploaded image — needed to
  -- reproduce the exact same fit-to-width display scale when a plan is
  -- reopened, since units_per_pixel below is calibrated in that display
  -- space (see MAX_DISPLAY_WIDTH in the client component).
  image_width      integer not null,
  image_height     integer not null,
  units_per_pixel  numeric,
  calibration_unit text,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists job_plans_job_idx on job_plans(job_id);

create table if not exists job_plan_measurements (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references job_plans(id) on delete cascade,
  type       text not null check (type in ('linear', 'area', 'count')),
  label      text not null,
  value      numeric not null,
  unit       text not null,
  -- The clicked points themselves (display-pixel space, [{x,y}, ...]) — kept
  -- so a reopened plan can redraw the measurement overlay, not just show a
  -- bare number with no way to see where it came from.
  points     jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists job_plan_measurements_plan_idx on job_plan_measurements(plan_id);

create trigger trg_job_plans_updated_at before update on job_plans
  for each row execute function set_updated_at();

alter table job_plans enable row level security;
alter table job_plan_measurements enable row level security;

-- Same predicate as job_diary_entries (20260820120000): SELECT scoped to job
-- visibility (admin/owner, primary assignee, or secondary assignee); writes
-- stay company-scoped, matching the established (if inconsistent-looking)
-- precedent already used by job_notes/job_materials/job_diary_entries.
create policy "members select job_plans" on job_plans
  for select using (job_id in (
    select id from jobs
    where company_id = current_company_id()
      and (
        is_admin_or_owner()
        or assigned_to = auth.uid()
        or exists (
          select 1 from job_assignees ja
          where ja.job_id = jobs.id
            and ja.profile_id = auth.uid()
            and ja.company_id = current_company_id()
        )
      )
  ));
create policy "members write job_plans" on job_plans
  for insert with check (company_id = current_company_id());
create policy "members update job_plans" on job_plans
  for update using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy "members delete job_plans" on job_plans
  for delete using (company_id = current_company_id());

create policy "members select job_plan_measurements" on job_plan_measurements
  for select using (plan_id in (select id from job_plans where job_id in (
    select id from jobs
    where company_id = current_company_id()
      and (
        is_admin_or_owner()
        or assigned_to = auth.uid()
        or exists (
          select 1 from job_assignees ja
          where ja.job_id = jobs.id
            and ja.profile_id = auth.uid()
            and ja.company_id = current_company_id()
        )
      )
  )));
create policy "members write job_plan_measurements" on job_plan_measurements
  for insert with check (plan_id in (select id from job_plans where company_id = current_company_id()));
create policy "members delete job_plan_measurements" on job_plan_measurements
  for delete using (plan_id in (select id from job_plans where company_id = current_company_id()));
