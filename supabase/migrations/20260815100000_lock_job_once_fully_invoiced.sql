-- Full freeze: once a job has been invoiced to its full quoted amount,
-- nothing about it can change except the admin↔technician message thread
-- (job_notes.kind='message', added 2026-08-12) and an explicit owner/admin
-- unlock. Enforced with triggers, not just app-level checks or RLS, so it
-- holds regardless of write path — web, mobile-online, mobile's PowerSync
-- sync-on-reconnect, or a direct API call. Mirrors the existing
-- 20260807110000_lock_invoice_financials_to_draft.sql pattern, applied to the
-- job side instead of the invoice side.

alter table jobs
  add column if not exists invoice_lock_override boolean not null default false;
comment on column jobs.invoice_lock_override is
  'Owner/admin escape hatch: true bypasses the fully-invoiced lock, mirroring "Revert to draft" on invoices.';

-- jobs is SELECT jobs.* (wildcard) in both sync-rules.yaml streams, so this
-- new column reaches devices automatically going forward — but ALTER TABLE
-- ADD COLUMN does not backfill existing rows through logical replication
-- (the exact trap behind the 2026-08-02 outage). Force existing rows through
-- the WAL so already-synced jobs pick up the column instead of a device
-- holding it as undefined.
--
-- Unlike job_notes (20260812100000, which has no updated_at), jobs DOES have
-- an updated_at-bumping trigger (trg_jobs_updated_at) — a bare backfill would
-- falsely touch every job's timestamp, same problem the 2026-08-02 fix hit on
-- profiles. Suppress triggers for this statement only.
set local session_replication_role = 'replica';
update jobs set id = id;
set local session_replication_role = 'origin';

-- "Fully invoiced" = the job has a quote AND live (non-void) invoice subtotals
-- sum to at least the quote total. A job with no quote has no ceiling to be
-- "full" against (same reasoning as jobTotal()/invoiceGuard() in
-- lib/job-financials.ts, which this mirrors — keep the two in sync).
create or replace function job_is_locked(p_job_id uuid) returns boolean as $$
declare
  v_quote_total numeric;
  v_override boolean;
  v_invoiced numeric;
begin
  select q.total, j.invoice_lock_override into v_quote_total, v_override
  from jobs j
  left join quotes q on q.id = j.quote_id
  where j.id = p_job_id;

  if v_quote_total is null or v_override then
    return false;
  end if;

  select coalesce(sum(subtotal), 0) into v_invoiced
  from invoices
  where job_id = p_job_id and status <> 'void';

  return v_invoiced >= v_quote_total - 0.01; -- same EPS as invoiceGuard()
end;
$$ language plpgsql stable security definer set search_path = public;

-- Generic guard for every job-linked table below: block INSERT/UPDATE/DELETE
-- outright once the parent job is locked. One function, reused by every
-- CREATE TRIGGER — avoids ten near-identical hand-written trigger bodies.
create or replace function block_write_if_job_locked() returns trigger as $$
declare
  v_job_id uuid := coalesce(new.job_id, old.job_id);
begin
  if job_is_locked(v_job_id) then
    raise exception 'This job has been invoiced in full and is locked. An owner or admin must unlock it before making changes.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'job_materials', 'timesheets', 'job_visits', 'job_assignees',
    'job_photos', 'form_submissions', 'compliance_documents',
    'purchase_orders', 'progress_claims'
  ]
  loop
    execute format('drop trigger if exists lock_%I on %I', t, t);
    execute format(
      'create trigger lock_%I before insert or update or delete on %I for each row execute function block_write_if_job_locked()',
      t, t
    );
  end loop;
end $$;

-- job_notes is the one exception: a 'message' row must always be writable
-- (that's the whole point of the messaging feature), only 'note' rows lock.
create or replace function block_job_note_write_if_locked() returns trigger as $$
declare
  v_kind text := case when TG_OP = 'DELETE' then old.kind else new.kind end;
  v_job_id uuid := coalesce(new.job_id, old.job_id);
begin
  if v_kind = 'message' then
    return coalesce(new, old);
  end if;
  if job_is_locked(v_job_id) then
    raise exception 'This job has been invoiced in full and is locked. An owner or admin must unlock it before making changes.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists lock_job_notes on job_notes;
create trigger lock_job_notes
  before insert or update or delete on job_notes
  for each row execute function block_job_note_write_if_locked();

-- The jobs row itself: block edits to any field except two narrow, safe
-- exceptions —
--   1. A bare status change (nothing else on the row differs). Completing a
--      job runs an UPDATE ... SET status = ... that, on mobile, fires AFTER
--      the invoice that creates the lock (deliberately — "a failed invoice
--      must not complete the job", see tradiee-mobile/app/jobs/[id].tsx). If
--      status weren't exempt, completing a job via mobile would immediately
--      lock itself out of the one write that legitimately follows.
--   2. Toggling invoice_lock_override — otherwise nothing could ever unlock
--      a locked job.
-- Uses a jsonb diff rather than hand-listing every other column, so it
-- doesn't silently stop covering a column added by some future migration.
create or replace function block_job_edit_if_locked() returns trigger as $$
declare
  v_rest_unchanged boolean;
begin
  v_rest_unchanged := (
    to_jsonb(new) - 'status' - 'invoice_lock_override' - 'updated_at'
    = to_jsonb(old) - 'status' - 'invoice_lock_override' - 'updated_at'
  );
  if v_rest_unchanged then
    return new;
  end if;
  if job_is_locked(old.id) then
    raise exception 'This job has been invoiced in full and is locked. An owner or admin must unlock it before making changes.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists lock_jobs_row on jobs;
create trigger lock_jobs_row
  before update on jobs
  for each row execute function block_job_edit_if_locked();
