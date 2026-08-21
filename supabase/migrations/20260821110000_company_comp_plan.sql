-- Lets an operator grant a company a real paid plan for a fixed window with
-- no card required — for friends/testers giving feedback, not a customer
-- billing mechanism. Distinct from billing_exempt (permanent, unrestricted,
-- 'pro') and trial_ends_at (the one-time 28-day signup trial): a comp names
-- a specific plan tier and expires back to the free floor on its own.
--
-- Written by the separate Industry Forms Admin console (a different Next.js
-- app, different Supabase project — ixqanvwohppohttbnrzz) via the new
-- /api/admin/companies/[id]/comp route, authenticated by ADMIN_CONSOLE_API_KEY
-- (server-to-server, not a user session). This app is the source of truth for
-- what the columns mean; the admin console just calls in.

alter table companies
  add column if not exists comp_plan text,
  add column if not exists comp_until timestamptz;
comment on column companies.comp_plan is
  'Plan key (see lib/plans.ts PlanKey) granted for free until comp_until. Null = no active comp.';
comment on column companies.comp_until is
  'When the comp grant expires and the company falls back to its real subscription/trial/free status.';

-- Mirrors effectivePlanKey() in tradiee-app/lib/billing.ts. Intentionally
-- duplicated logic (SQL trigger vs TS) — same flagged drift risk as
-- job_is_locked()/invoiceGuard() and company_effective_plan() itself. If the
-- resolution order ever changes, update both.
create or replace function company_effective_plan(p_company_id uuid) returns text as $$
declare
  v_billing_exempt boolean;
  v_status text;
  v_plan text;
  v_trial_ends_at timestamptz;
  v_comp_plan text;
  v_comp_until timestamptz;
begin
  select billing_exempt, subscription_status, subscription_plan, trial_ends_at, comp_plan, comp_until
    into v_billing_exempt, v_status, v_plan, v_trial_ends_at, v_comp_plan, v_comp_until
  from companies where id = p_company_id;

  if v_billing_exempt then
    return 'pro';
  end if;
  if v_status = 'active' then
    return coalesce(v_plan, 'free');
  end if;
  if v_comp_plan is not null and v_comp_until is not null and v_comp_until > now() then
    return v_comp_plan;
  end if;
  if v_trial_ends_at is not null and v_trial_ends_at > now() then
    return 'trial';
  end if;
  return 'free';
end;
$$ language plpgsql stable security definer set search_path = public;
