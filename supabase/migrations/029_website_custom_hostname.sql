-- Track the Cloudflare for SaaS custom-hostname id so we can poll status / delete
-- when a tradie connects (or removes) their own domain to their Instant Website.
alter table company_websites add column if not exists cf_hostname_id text;
