-- PowerSync Postgres publication — RUN THIS AFTER ANY SUPABASE PROJECT MOVE.
--
-- This is database-level state, NOT part of the migrations, so `supabase db push`
-- does NOT recreate it. The Singapore -> Sydney migration (2026-07-26) recreated
-- the publication with only 18 of the 23 tables the sync rules touch; `profiles`
-- was among the missing ones, which silently killed the entire `admin_company`
-- stream (invoices, quotes, customers, enquiries, messages all stopped syncing to
-- mobile) while `staff_jobs` kept working because it joins job_assignees and has
-- no profiles/role check. Symptom looked like "invoices are broken"; the cause was
-- an unpublished table.
--
-- Every table referenced by sync-rules.yaml must be published — including tables
-- only used in a JOIN (e.g. profiles), not just those in a SELECT.
--
-- Safe to re-run: each statement is guarded, so already-published tables are skipped.

-- ⚠ Adding a table to a publication does NOT backfill its existing rows.
-- Logical replication only streams changes from that moment on, so PowerSync
-- ends up with an EMPTY copy of the newly-added table. That is what kept the
-- admin_company stream dead even after `profiles` was published: every query in
-- it JOINs profiles, and PowerSync had zero profiles rows. This script therefore
-- also touches each newly-added table (no-op UPDATE) so the rows hit the WAL and
-- PowerSync materialises them. Triggers are suppressed during the touch so
-- updated_at timestamps aren't falsely bumped.

do $$
declare
  t text;
  added text[] := '{}';
  -- Derived from sync-rules.yaml: every table appearing in a SELECT *or* a JOIN.
  -- Keep in sync when sync-rules.yaml changes. Regenerate with:
  --   grep -oE "(SELECT|FROM|INNER JOIN) [a-z_]+" sync-rules.yaml \
  --     | awk '{print $NF}' | sed 's/\.\*//' | sort -u
  wanted text[] := array[
    'customer_messages', 'customer_sites', 'customers', 'enquiries',
    'form_submissions', 'form_templates', 'invoice_line_items', 'invoices',
    'job_assignees', 'job_diary_entries', 'job_materials', 'job_notes',
    'job_photos', 'job_visits', 'jobs', 'price_list_items', 'profiles',
    'project_stages', 'projects', 'quote_line_items', 'quote_sections',
    'quotes', 'timesheets', 'travel_logs'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    raise exception 'publication "powersync" does not exist — create it first';
  end if;

  foreach t in array wanted loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      raise notice 'skipping %, table does not exist', t;
    elsif exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = t) then
      raise notice 'already published: %', t;
    else
      execute format('alter publication powersync add table public.%I', t);
      added := added || t;
      raise notice 'ADDED: %', t;
    end if;
  end loop;

  -- Backfill only what was just added — re-touching every table on every run
  -- would churn the WAL for no reason.
  if coalesce(array_length(added, 1), 0) > 0 then
    perform set_config('session_replication_role', 'replica', true); -- true = this txn only
    foreach t in array added loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'id'
      ) then
        execute format('update public.%I set id = id', t);
        raise notice 'backfilled rows into replication stream: %', t;
      else
        raise warning 'no id column on % — backfill it manually or PowerSync will hold an empty copy', t;
      end if;
    end loop;
  end if;
end $$;

-- Verify: should list every table above, and nothing the sync rules need should
-- be absent.
--   select tablename from pg_publication_tables where pubname = 'powersync' order by 1;
