-- Site diary: one dated entry per job per day (progress, crew on site,
-- weather, delays), logged from the field — mostly on mobile, where crews
-- actually are. Deliberately synced via PowerSync (sync-rules.yaml +
-- publication below + both client schemas), unlike the last three features
-- this project shipped (variations, cost_categories) — those were owner/
-- admin back-office money concerns with no mobile audience; this one's whole
-- point is a technician logging it on site, often with patchy signal.
--
-- Weather is a free-text field the crew types themselves (e.g. "Fine, mild"
-- or "Heavy rain, delayed the roof"), not an auto-fetched integration — no
-- weather API is wired into this codebase yet, and a half-built auto-fetch
-- (fetch on save, silently blank when it fails, no historical backfill) is
-- worse than an honest manual field. Auto-fetch from the site's lat/lng
-- (customer_sites already has them) is a real follow-up, not attempted here.

create table if not exists job_diary_entries (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  author_id    uuid references profiles(id) on delete set null,
  entry_date   date not null,
  notes        text,
  crew_on_site text,
  weather      text,
  delays       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One entry per job per day — logging again the same day edits today's
  -- entry rather than creating a second one, same mental model as a real
  -- paper site diary. The app upserts on (job_id, entry_date).
  unique (job_id, entry_date)
);
create index if not exists job_diary_entries_job_idx on job_diary_entries(job_id, entry_date desc);

create trigger trg_job_diary_entries_updated_at before update on job_diary_entries
  for each row execute function set_updated_at();

alter table job_diary_entries enable row level security;

-- SELECT scoped to job visibility (admin/owner, primary assignee, or
-- secondary assignee) — the current-generation predicate every other
-- job-scoped table uses (mirrors job_notes/job_materials's own latest select
-- policy, 20260701082916_secondary_assignee_schedule_visibility.sql).
create policy "members select job_diary_entries" on job_diary_entries
  for select using (job_id in (
    select id from jobs
    where company_id = current_company_id()
      and (
        is_admin_or_owner()
        or assigned_to = auth.uid()
        or exists (
          select 1 from job_assignees ja
          where ja.job_id = jobs.id
            and ja.profile_id = auth.uid()
            and ja.company_id = current_company_id()
        )
      )
  ));
-- Writes stay company-scoped rather than assignment-scoped, matching the
-- established (if inconsistent-looking) precedent on job_notes/job_materials
-- — reads are tightened for privacy, writes never have been in this repo.
create policy "members write job_diary_entries" on job_diary_entries
  for insert with check (company_id = current_company_id());
create policy "members update job_diary_entries" on job_diary_entries
  for update using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy "members delete job_diary_entries" on job_diary_entries
  for delete using (company_id = current_company_id());

-- New table — no ALTER TABLE ADD COLUMN backfill trap here (that only bites
-- an already-synced table with existing rows). Still needs adding to the
-- publication so PowerSync can stream it at all.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'powersync') then
    raise notice 'publication "powersync" does not exist — nothing to do';
  elsif exists (select 1 from pg_publication_tables where pubname = 'powersync' and tablename = 'job_diary_entries') then
    raise notice 'already published: job_diary_entries';
  else
    alter publication powersync add table public.job_diary_entries;
    raise notice 'ADDED: job_diary_entries';
  end if;
end $$;
