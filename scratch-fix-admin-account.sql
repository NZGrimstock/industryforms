-- Fixes admin@industryforms.co.nz: an auth.users account exists but its
-- profiles row (and thus company + is_super_admin) was never created.
-- Creates a dedicated, billing-exempt admin company and links the profile.
-- Safe to re-run — only creates what's missing, always ensures the flags.

do $$
declare
  v_user_id uuid;
  v_company_id uuid;
begin
  select id into v_user_id from auth.users where email = 'admin@industryforms.co.nz';
  if v_user_id is null then
    raise exception 'No auth.users row for admin@industryforms.co.nz — check the email is exact';
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    -- Profile already exists (maybe from a partial fix) — just ensure the flags.
    update profiles set is_super_admin = true where id = v_user_id;
    update companies set billing_exempt = true
      where id = (select company_id from profiles where id = v_user_id);
    raise notice 'Profile already existed — is_super_admin/billing_exempt ensured.';
  else
    insert into companies (name, country, billing_exempt)
    values ('IndustryForms Admin', 'NZ', true)
    returning id into v_company_id;

    insert into profiles (id, company_id, full_name, email, role, is_super_admin)
    values (v_user_id, v_company_id, 'Admin', 'admin@industryforms.co.nz', 'admin', true);

    raise notice 'Created company % and profile for %', v_company_id, v_user_id;
  end if;
end $$;

-- Verify:
select p.id, p.email, p.role, p.is_super_admin, c.name as company, c.billing_exempt
from profiles p join companies c on c.id = p.company_id
where p.email = 'admin@industryforms.co.nz';
