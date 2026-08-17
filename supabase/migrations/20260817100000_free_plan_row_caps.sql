-- Free-plan volume caps on jobs and customers. Enforced with a trigger, not
-- just the /api/jobs server route, because customers have NO server route at
-- all (customer-form.tsx inserts straight from the client via Supabase JS —
-- RLS/triggers are the only thing that can stop it), and jobs are also
-- created offline on mobile via PowerSync, which writes straight to Postgres
-- on sync and never touches /api/jobs. Same class of bug this project has
-- already been burned by twice (2026-08-02 outage, the 2026-08-15 job-lock
-- session) — an app-layer-only check looks like it works until a write path
-- that bypasses the app hits it.

-- Mirrors effectivePlanKey() in tradiee-app/lib/billing.ts. Intentionally
-- duplicated logic (SQL trigger vs TS) — same flagged drift risk as
-- job_is_locked() vs invoiceGuard() (20260815100000). If the trial/free/paid
-- resolution rules ever change, update both.
create or replace function company_effective_plan(p_company_id uuid) returns text as $$
declare
  v_billing_exempt boolean;
  v_status text;
  v_plan text;
  v_trial_ends_at timestamptz;
begin
  select billing_exempt, subscription_status, subscription_plan, trial_ends_at
    into v_billing_exempt, v_status, v_plan, v_trial_ends_at
  from companies where id = p_company_id;

  if v_billing_exempt then
    return 'pro';
  end if;
  if v_status = 'active' then
    return coalesce(v_plan, 'free');
  end if;
  if v_trial_ends_at is not null and v_trial_ends_at > now() then
    return 'trial';
  end if;
  return 'free';
end;
$$ language plpgsql stable security definer set search_path = public;

-- Row caps mirror the free plan's maxJobs (3) / maxCustomers (10) in
-- tradiee-app/lib/plans.ts — same drift risk noted above, kept as plain
-- constants here rather than a shared config table (matches job_is_locked()
-- being self-contained SQL, not reading from app config). "Active" jobs
-- excludes terminal statuses, same semantics as the jobs list's own "Active"
-- pill — a free-tier company shouldn't get permanently capped by jobs it
-- already finished. job_statuses is per-company customizable (Settings →
-- Workflow lets an owner rename or replace the seeded 'completed'/
-- 'cancelled' rows), so this joins on job_statuses.is_terminal rather than
-- hardcoding those two keys — a hardcoded check would silently stop
-- excluding finished jobs the moment a company renamed their terminal
-- status, permanently capping them.
create or replace function enforce_plan_row_cap() returns trigger as $$
declare
  v_kind text := TG_ARGV[0];
  v_label text := TG_ARGV[1];
  v_cap integer;
  v_count integer;
begin
  -- Locks the company row for the rest of this transaction, serializing
  -- concurrent inserts for the same company (e.g. a web request and a
  -- mobile PowerSync sync landing at once) so two racing inserts can't both
  -- read the same under-cap count and both pass.
  perform 1 from companies where id = new.company_id for update;

  if company_effective_plan(new.company_id) <> 'free' then
    return new;
  end if;

  if v_kind = 'jobs' then
    v_cap := 3;
    -- A job counts as terminal (excluded from the cap) when job_statuses has
    -- a matching row saying so, OR — if job_statuses has no row at all for
    -- that status, which should never happen for a real company (signup
    -- always seeds it) but would otherwise make every job in that company
    -- count as active forever, including finished ones — the status is one
    -- of the two seeded default keys. Belt and braces, not an either/or.
    select count(*) into v_count from jobs j
      where j.company_id = new.company_id
        and not exists (
          select 1 from job_statuses js
          where js.company_id = j.company_id and js.key = j.status and js.is_terminal
        )
        and (
          exists (select 1 from job_statuses js where js.company_id = j.company_id and js.key = j.status)
          or j.status not in ('completed', 'cancelled')
        );
  elsif v_kind = 'customers' then
    v_cap := 10;
    select count(*) into v_count from customers where company_id = new.company_id;
  else
    raise exception 'enforce_plan_row_cap: unknown kind %', v_kind;
  end if;

  if v_count >= v_cap then
    raise exception 'Free plan is capped at % % — upgrade to add more.', v_cap, v_label
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists cap_free_plan_jobs on jobs;
create trigger cap_free_plan_jobs
  before insert on jobs
  for each row execute function enforce_plan_row_cap('jobs', 'active jobs');

drop trigger if exists cap_free_plan_customers on customers;
create trigger cap_free_plan_customers
  before insert on customers
  for each row execute function enforce_plan_row_cap('customers', 'customers');
