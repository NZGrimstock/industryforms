-- Run this in Supabase Studio -> SQL Editor on the CLOUD project
-- (cfltbpwrojtlpkjvresd), and paste back everything it returns.

-- 1. Does the auth user exist, and under exactly what email/casing?
select id, email, created_at, email_confirmed_at
from auth.users
where email ilike '%industryforms%admin%' or email ilike '%admin%industryforms%';

-- 2. Does a profiles row exist for that id, and what does it say?
select p.id, p.email as profile_email, p.role, p.is_super_admin, p.company_id,
       c.name as company_name, c.billing_exempt, c.subscription_status, c.trial_ends_at
from profiles p
left join companies c on c.id = p.company_id
where p.id in (select id from auth.users where email ilike '%admin%industryforms%');

-- 3. In case of a typo/duplicate: any profiles row with this email at all,
--    regardless of id (would explain a unique-constraint conflict)?
select id, email, company_id, is_super_admin from profiles
where email ilike '%admin%industryforms%';
