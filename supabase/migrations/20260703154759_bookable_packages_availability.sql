-- Sprint C: bookable packages + availability engine schema.
-- Idempotent (if-not-exists throughout).

create table if not exists bookable_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kit_id uuid references kits(id) on delete set null,
  price_list_item_id uuid references price_list_items(id) on delete set null,
  name text not null,
  description text,
  category text,
  public_slug text,
  duration_minutes integer not null default 60,
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 15,
  price numeric(12,2) not null default 0,
  deposit_amount numeric(12,2),
  deposit_percent numeric(6,2),
  requires_deposit boolean not null default false,
  auto_confirm boolean not null default false,
  creates_job boolean not null default true,
  creates_invoice boolean not null default false,
  recurring_interval_months integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookable_packages_company_idx
  on bookable_packages(company_id, is_active, sort_order);
create unique index if not exists bookable_packages_public_slug_idx
  on bookable_packages(company_id, public_slug) where public_slug is not null;

create table if not exists booking_settings (
  company_id uuid primary key references companies(id) on delete cascade,
  timezone text not null default 'Pacific/Auckland',
  min_notice_hours integer not null default 12,
  max_days_ahead integer not null default 45,
  slot_interval_minutes integer not null default 30,
  default_buffer_minutes integer not null default 15,
  require_manual_approval boolean not null default true,
  confirmation_channel text not null default 'email',
  reminder_hours_before integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists booking_availability_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true
);
create index if not exists booking_availability_rules_company_idx
  on booking_availability_rules(company_id, is_active);

create table if not exists booking_blackouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text
);
create index if not exists booking_blackouts_company_idx
  on booking_blackouts(company_id, starts_at, ends_at);

-- Brought forward from Sprint D's schema: the concurrency-safe slot-hold
-- mechanism (Sprint C's own acceptance criteria — "two simultaneous holds,
-- exactly one succeeds" — can't be built or tested without this table).
-- Only the hold-related columns are exercised in Sprint C; deposits, Stripe,
-- and customer-linking are unbuilt until Sprint D's public widget exists.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  package_id uuid references bookable_packages(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  enquiry_id uuid references enquiries(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  visit_id uuid references job_visits(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  status text not null default 'requested',
  customer_name text not null default '',
  customer_email text,
  customer_phone text,
  site_address text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hold_expires_at timestamptz,
  deposit_required numeric(12,2) not null default 0,
  deposit_paid numeric(12,2) not null default 0,
  deposit_refunded numeric(12,2) not null default 0,
  stripe_payment_intent_id text,
  public_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_status_chk') then
    alter table bookings add constraint bookings_status_chk check (status in (
      'requested', 'slot_held', 'deposit_pending', 'confirmed', 'scheduled',
      'completed', 'cancelled', 'no_show'
    ));
  end if;
end $$;
create index if not exists bookings_company_status_idx on bookings(company_id, status, starts_at);
create unique index if not exists bookings_public_token_idx on bookings(public_token);

-- The concurrency guard: at most one *live* (non-expired) hold or confirmed
-- booking per (company, assigned staff, start time). A partial unique index
-- is the actual safety mechanism — see lib/bookings/availability.ts for how
-- the insert relies on this to guarantee "exactly one succeeds".
create unique index if not exists bookings_slot_uniqueness_idx
  on bookings(company_id, assigned_to, starts_at)
  where status in ('slot_held', 'requested', 'deposit_pending', 'confirmed', 'scheduled');

alter table bookable_packages enable row level security;
alter table booking_settings enable row level security;
alter table booking_availability_rules enable row level security;
alter table booking_blackouts enable row level security;
alter table bookings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bookable_packages' and policyname = 'company members select packages') then
    create policy "company members select packages" on bookable_packages
      for select using (company_id = current_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bookable_packages' and policyname = 'admins manage packages') then
    create policy "admins manage packages" on bookable_packages
      for all using (company_id = current_company_id() and is_admin_or_owner())
      with check (company_id = current_company_id() and is_admin_or_owner());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'booking_settings' and policyname = 'company members select settings') then
    create policy "company members select settings" on booking_settings
      for select using (company_id = current_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'booking_settings' and policyname = 'admins manage settings') then
    create policy "admins manage settings" on booking_settings
      for all using (company_id = current_company_id() and is_admin_or_owner())
      with check (company_id = current_company_id() and is_admin_or_owner());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'booking_availability_rules' and policyname = 'company members select rules') then
    create policy "company members select rules" on booking_availability_rules
      for select using (company_id = current_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'booking_availability_rules' and policyname = 'admins manage rules') then
    create policy "admins manage rules" on booking_availability_rules
      for all using (company_id = current_company_id() and is_admin_or_owner())
      with check (company_id = current_company_id() and is_admin_or_owner());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'booking_blackouts' and policyname = 'company members select blackouts') then
    create policy "company members select blackouts" on booking_blackouts
      for select using (company_id = current_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'booking_blackouts' and policyname = 'admins manage blackouts') then
    create policy "admins manage blackouts" on booking_blackouts
      for all using (company_id = current_company_id() and is_admin_or_owner())
      with check (company_id = current_company_id() and is_admin_or_owner());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'bookings' and policyname = 'company members select bookings') then
    create policy "company members select bookings" on bookings
      for select using (company_id = current_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bookings' and policyname = 'admins manage bookings') then
    create policy "admins manage bookings" on bookings
      for all using (company_id = current_company_id() and is_admin_or_owner())
      with check (company_id = current_company_id() and is_admin_or_owner());
  end if;
end $$;
