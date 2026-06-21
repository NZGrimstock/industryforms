-- Instant Website builder: one editable marketing site per company.
-- Public site is served at /site/<slug>; the contact form creates an enquiry.
-- Publishing is gated behind a $15/mo "website" add-on subscription (separate
-- from the main app plan) tracked by `subscription_active`.

create table company_websites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  slug text not null unique,
  is_published boolean not null default false,

  -- Look & content
  theme jsonb not null default '{"primary":"#f97316","font":"sans"}'::jsonb,
  sections jsonb not null default '[]'::jsonb,  -- ordered array of typed section objects
  seo_title text,
  seo_description text,

  -- Custom domain (Cloudflare for SaaS) — provisioning wired separately
  custom_domain text unique,
  domain_status text not null default 'none', -- 'none' | 'pending' | 'active'

  -- $15/mo add-on gate for publishing
  subscription_active boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index company_websites_company_id_idx on company_websites(company_id);
create index company_websites_slug_idx on company_websites(slug);

create trigger set_company_websites_updated_at before update on company_websites
  for each row execute function set_updated_at();

-- RLS: company members manage their own site. Public reads go through the
-- service-role client (bypasses RLS), so no public select policy is needed.
alter table company_websites enable row level security;

create policy "company members can view their website" on company_websites
  for select using (company_id = current_company_id());
create policy "company members can insert their website" on company_websites
  for insert with check (company_id = current_company_id());
create policy "company members can update their website" on company_websites
  for update using (company_id = current_company_id());
create policy "admins can delete their website" on company_websites
  for delete using (company_id = current_company_id() and is_admin_or_owner());
