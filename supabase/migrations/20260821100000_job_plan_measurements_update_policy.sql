-- job_plan_measurements (20260820140000) got select/insert/delete but no
-- update policy, unlike every sibling job-linked table added the same day
-- (job_plans, job_diary_entries both have all four). Nothing writes an
-- UPDATE today, but a future "rename/fix a measurement" would otherwise
-- silently no-op under RLS — Postgres filters an update to zero matching
-- rows rather than erroring, so the client would see a successful response
-- with nothing actually changed. Caught by the 2026-08-21 reality-check pass.
create policy "members update job_plan_measurements" on job_plan_measurements
  for update using (plan_id in (select id from job_plans where company_id = current_company_id()))
  with check (plan_id in (select id from job_plans where company_id = current_company_id()));
