-- Folds supabase/powersync-publication.sql's table list into the tracked
-- migration sequence. That script is idempotent and has already been run
-- against the live (Sydney) project — this migration doesn't change
-- production's current publication state, confirmed by querying
-- pg_publication_tables directly before writing this.
--
-- What it fixes: migration 022 alone only creates the *original* narrower
-- publication (18 tables). The 2026-08-02 session added the missing ones
-- (profiles, enquiries, customer_messages, projects, project_stages) via the
-- standalone script instead of a migration, specifically so it could be
-- re-run manually after any future project move without needing a new
-- migration each time — but that means a *fresh* environment (new dev
-- machine, disaster-recovery restore, `supabase db push` from scratch) would
-- silently reproduce the exact publication gap that caused that outage,
-- since `supabase db push` only ever applies this migrations/ directory, not
-- the standalone script. This closes that drift for the "normal" path;
-- supabase/powersync-publication.sql still exists and is still the right
-- thing to run after a raw pg_dump-style project move that bypasses
-- migrations entirely.
--
-- Guarded exactly like the standalone script: skips tables that don't exist
-- and tables already in the publication, so this is safe to run against any
-- state. See supabase/powersync-publication.sql for the backfill-on-add
-- behaviour (not repeated here — this migration only needs to run once on
-- top of a project where that script has never run, and a fresh project's
-- tables are all empty anyway).

do $$
declare
  t text;
  wanted text[] := array[
    'customer_messages', 'customer_sites', 'customers', 'enquiries',
    'form_submissions', 'form_templates', 'invoice_line_items', 'invoices',
    'job_assignees', 'job_materials', 'job_notes', 'job_photos', 'job_visits',
    'jobs', 'price_list_items', 'profiles', 'project_stages', 'projects',
    'quote_line_items', 'quote_sections', 'quotes', 'timesheets', 'travel_logs'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    raise notice 'publication "powersync" does not exist — nothing to do (created by migration 022)';
    return;
  end if;

  foreach t in array wanted loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      raise notice 'skipping %, table does not exist', t;
    elsif exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = t) then
      raise notice 'already published: %', t;
    else
      execute format('alter publication powersync add table public.%I', t);
      raise notice 'ADDED: %', t;
    end if;
  end loop;
end $$;
