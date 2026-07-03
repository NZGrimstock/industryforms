-- Sprint B: consolidate website gating onto companies.addons.bookings_website
-- (matching the existing hasAddon() pattern used by 'projects'), and add the
-- bookings toggle + custom static-site hosting fields onto company_websites
-- (the existing 1:1 per-company website config table — not `companies`,
-- which is where the doc sketch put them; company_websites already owns
-- every other website concern: theme, sections, custom_domain, etc).

-- Bookings toggle + custom hosting fields.
alter table company_websites
  add column if not exists bookings_enabled   boolean not null default false,
  add column if not exists site_mode          text not null default 'builder',
  add column if not exists custom_site_key    text,
  add column if not exists custom_site_status text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_websites_site_mode_chk') then
    alter table company_websites
      add constraint company_websites_site_mode_chk check (site_mode in ('builder', 'custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_websites_custom_status_chk') then
    alter table company_websites
      add constraint company_websites_custom_status_chk check (custom_site_status in ('none', 'active', 'disabled'));
  end if;
end $$;

-- One-time backfill: any company already paying for the (formerly $15/mo,
-- website-only) add-on carries forward as bookings_website-entitled, so
-- nobody currently publishing a site loses access when gating switches from
-- company_websites.subscription_active to hasAddon('bookings_website').
update companies c
set addons = jsonb_set(coalesce(c.addons, '{}'::jsonb), '{bookings_website}', '{"active": true}'::jsonb)
from company_websites w
where w.company_id = c.id
  and w.subscription_active = true
  and coalesce((c.addons -> 'bookings_website' ->> 'active')::boolean, false) = false;
