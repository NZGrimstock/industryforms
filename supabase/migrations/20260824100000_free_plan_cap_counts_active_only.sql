-- enforce_plan_row_cap() (20260817100000, extended 20260822120000) counted
-- every customers/price_list_items row for the company regardless of
-- is_active, so archiving a row never freed up cap room. That made the
-- planned "pick which N to carry over on downgrade" flow pointless: a company
-- that imported 1000 customers on trial, let it lapse to free, and archived
-- 990 of them down to the 10-item cap would still be blocked from adding an
-- 11th, because the count query saw all 1000. jobs is unaffected — its count
-- already excludes terminal-status jobs via a different mechanism.
create or replace function enforce_plan_row_cap() returns trigger as $$
declare
  v_kind text := TG_ARGV[0];
  v_label text := TG_ARGV[1];
  v_cap integer;
  v_count integer;
begin
  perform 1 from companies where id = new.company_id for update;

  if company_effective_plan(new.company_id) <> 'free' then
    return new;
  end if;

  if v_kind = 'jobs' then
    v_cap := 3;
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
    select count(*) into v_count from customers where company_id = new.company_id and is_active = true;
  elsif v_kind = 'price_list_items' then
    v_cap := 50;
    select count(*) into v_count from price_list_items where company_id = new.company_id and is_active = true;
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
