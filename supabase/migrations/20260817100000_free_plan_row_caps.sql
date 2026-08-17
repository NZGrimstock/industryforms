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
-- excludes the two terminal statuses, same semantics as the jobs list's own
-- "Active" pill — a free-tier company shouldn't get permanently capped by
-- jobs it already finished.
create or replace function enforce_plan_row_cap() returns trigger as $$
declare
  v_kind text := TG_ARGV[0];
  v_label text := TG_ARGV[1];
  v_cap integer;
  v_count integer;
begin
  if company_effective_plan(new.company_id) <> 'free' then
    return new;
  end if;

  if v_kind = 'jobs' then
    v_cap := 3;
    select count(*) into v_count from jobs
      where company_id = new.company_id and status not in ('completed', 'cancelled');
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
