create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  phone text,
  business_name text,
  request_type text not null default 'account_and_associated_data',
  reason text,
  status text not null default 'pending',
  matched_profile_id uuid references profiles(id) on delete set null,
  matched_company_id uuid references companies(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  internal_notes text,
  constraint account_deletion_requests_status_check
    check (status in ('pending', 'verifying', 'completed', 'rejected', 'cancelled'))
);

create index if not exists account_deletion_requests_email_idx
  on account_deletion_requests (lower(email));

create index if not exists account_deletion_requests_status_idx
  on account_deletion_requests (status, created_at desc);

alter table account_deletion_requests enable row level security;

drop policy if exists "super admins manage account deletion requests" on account_deletion_requests;
create policy "super admins manage account deletion requests"
  on account_deletion_requests
  for all
  to authenticated
  using (
    exists (
      select 1
      from profiles p
      where p.id = (select auth.uid())
        and p.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1
      from profiles p
      where p.id = (select auth.uid())
        and p.is_super_admin = true
    )
  );

grant all on table account_deletion_requests to service_role;
grant select, update on table account_deletion_requests to authenticated;
