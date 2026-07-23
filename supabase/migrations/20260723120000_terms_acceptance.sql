-- Record each user's acceptance of the Terms of Service. terms_version stores
-- the accepted version (see lib/legal.ts CURRENT_TERMS_VERSION); a mismatch or
-- null re-prompts the user via the blocking acceptance gate in the dashboard.
alter table profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;
