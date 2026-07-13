-- Confirms whether the ambiguous-relationship theory is live.
select conname, conrelid::regclass as from_table, confrelid::regclass as to_table,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where (conrelid = 'companies'::regclass or conrelid = 'profiles'::regclass)
  and confrelid in ('companies'::regclass, 'profiles'::regclass)
  and contype = 'f';
