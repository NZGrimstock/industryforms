-- Free-plan feature restrictions that have no server API route to gate at
-- the app layer — both write straight from the client (web logbook UI,
-- mobile's background GPS tracker; the daily-todos cron writes server-side
-- but has no per-request company context to gate with resolveCompanyUser()).
-- Reuses company_effective_plan() from 20260817100000_free_plan_row_caps.sql.

-- Vehicle logbook (GPS-tracked trips) is entirely a paid feature — the whole
-- /logbook page is already gated web-side (redirects free-plan owner/admin to
-- /upgrade), but mobile's background tracker writes travel_logs directly via
-- Supabase with no page to gate, so this is the only real backstop for it.
create or replace function block_travel_log_if_free_plan() returns trigger as $$
begin
  if company_effective_plan(new.company_id) = 'free' then
    raise exception 'Vehicle logbook requires a paid plan.' using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists block_travel_logs_free_plan on travel_logs;
create trigger block_travel_logs_free_plan
  before insert on travel_logs
  for each row execute function block_travel_log_if_free_plan();

-- Auto-generated to-dos (daily-todos cron, is_auto = true) are a paid
-- feature; manually-created ones (is_auto = false, the app's default) stay
-- allowed on free. This is a backstop alongside the app-level skip already
-- added to the cron loop (app/api/daily-todos/route.ts) — belt and braces,
-- same reasoning as every other free-plan gate in this migration set.
create or replace function block_auto_todo_if_free_plan() returns trigger as $$
begin
  if new.is_auto and company_effective_plan(new.company_id) = 'free' then
    raise exception 'Automatic to-dos require a paid plan.' using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists block_auto_todos_free_plan on todos;
create trigger block_auto_todos_free_plan
  before insert on todos
  for each row execute function block_auto_todo_if_free_plan();
