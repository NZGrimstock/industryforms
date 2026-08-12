# Admin ↔ Technician Job Messaging — Scope

Last updated: 2026-08-12. Planning doc, nothing built. Scopes the two-way
in-app messaging feature discussed alongside the WebSMS swap.

## The headline decision: extend `job_notes`, don't create `job_messages`

The obvious move is a new `job_messages` table. **Don't.** `job_notes`
(migration `001_initial_schema.sql:280`) is already the exact shape needed —
`id, job_id, author_id, body, created_at` — and, critically, already has
everything a new table would need built from scratch:

| Already done for `job_notes` | Cost if we make a new table |
|---|---|
| In the `powersync` Postgres publication | Must add + **backfill** (the exact omission that caused the 2026-08-02 sync outage) |
| In `sync-rules.yaml` **both** streams (`admin_company` L26, `staff_jobs` L66-67) | 3 new query lines, dashboard re-upload, re-run `check-sync-rules.mjs` |
| In the PowerSync client schema of **both** apps (`lib/powersync/schema.ts` ×2) | 2 more edits |
| RLS select scoped to admin **or** primary assignee **or** `job_assignees` (migration `20260701082916`) — exactly the visibility a job thread wants | Write + test a new policy set |
| RLS insert allows any company member, so staff can already post (`002_rls_policies.sql:162`) | Same again |

The entire PowerSync/publication ceremony — the riskiest part of this
codebase, with a real outage in its history — costs **zero** if we reuse.

### The one real cost of reusing

`job_notes` renders on the job-sheet PDF (`components/pdf/job-sheet-pdf.tsx:279`).
Without a filter, "running 20 min late" lands on a printed job sheet. Fixed
with a discriminator column and a filter on the three read sites (below).

```sql
-- migration: add_job_note_kind.sql
alter table job_notes
  add column if not exists kind text not null default 'note';
-- kind: 'note' (durable job record, shows on job sheet)
--     | 'message' (conversation, push-notified, never on the job sheet)
create index if not exists job_notes_job_kind_idx on job_notes(job_id, kind, created_at desc);
```

Default `'note'` means every existing row and every existing insert keeps
today's exact behaviour — the migration is a no-op until something writes
`kind = 'message'`.

**Only 3 read sites need the filter** (verified by grep — there are no others):

1. `tradiee-app/app/(dashboard)/jobs/[id]/page.tsx:59` — feeds both the notes
   list and the job-sheet `sheetData`. **Split into two queries here**, one
   `.eq('kind','note')` for the sheet, one `.eq('kind','message')` for the thread.
   This is the only fiddly one; the other two are one-line changes.
2. `tradiee-mobile/app/jobs/[id].tsx:312` — the notes `SELECT`, add `AND kind = 'note'`.
3. Wherever `sheetData.notes` is assembled, if it doesn't come from (1).

**Decision to make before building:** should messages appear on the job sheet
PDF at all? Default here is **no** (chatter noise on a printed record).
Arguable the other way — a tech reading a printed sheet might want the
admin's notes on it. Cheap to flip later; the filter is one clause.

## Read state

One table, deliberately **not** PowerSync-synced (keeps this off the
publication/sync-rules path entirely — unread badges can require connectivity).

```sql
create table if not exists job_thread_reads (
  profile_id   uuid not null references profiles(id) on delete cascade,
  job_id       uuid not null references jobs(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (profile_id, job_id)
);
alter table job_thread_reads enable row level security;
create policy "own thread reads" on job_thread_reads
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
```

A high-water mark per (person, job), not per-message read receipts — one row
per user per job instead of N×M, and unread count is
`count(*) where created_at > last_read_at`. Upsert `last_read_at = now()` when
the thread is opened. Skipped: per-message "seen by" indicators, typing
indicators, delivery ticks. Add only if someone actually asks.

## Write path + push

The existing note-write path already goes **direct to Supabase**, not through
PowerSync (`tradiee-mobile/app/jobs/[id].tsx:643`, and web does a local
`db.execute` plus a `supabase.upsert` at `client.tsx:150-153`). So a server
route is a natural fit and matches how `/api/sms/send` already works:

**`POST /api/jobs/[id]/messages`** `{ body }` →
1. Verify caller is admin/owner **or** an assignee of that job (mirror the RLS
   predicate; don't rely on RLS alone since the push step needs the service client).
2. Insert `job_notes` row with `kind = 'message'`.
3. Fire push to *the other side*: if an admin wrote it → every assignee on the
   job; if a staff member wrote it → every owner/admin in the company.
   Never push to the author.

New helper in `lib/push.ts`, mirroring `notifyCompanyInbox()` almost exactly
(same `sendExpoPush`, same `expo_push_token` lookup — `profiles.expo_push_token`
already exists for every role, not just admins):

```ts
export async function notifyJobThread(
  supabase: SupabaseClient,
  opts: { jobId: string; companyId: string; authorId: string;
          authorName: string; jobNumber: string; body: string }
)
// data: { screen: 'job', jobId }  categoryId: 'job_message'
```

Note `notifyCompanyInbox` filters `.in('role', ['owner','admin'])` — the
technician direction needs the assignee list instead (`job_assignees` +
`jobs.assigned_to`), so it's a sibling function, not a parameter on the
existing one.

## Thread UI

**Mobile** (`tradiee-mobile/app/jobs/[id].tsx`) — the job detail screen already
has a notes section rendering at L312. Add a **Messages** tab/section beside
it reading `kind = 'message'`, styled as a conversation. Reuse the bubble
layout already built in `tradiee-mobile/app/messages/[key].tsx` (353 lines,
the customer SMS thread) — extract the bubble list if it's clean, copy if
extraction is more work than it saves. **Not a new route** — it lives on the
job, which is the whole point of the feature.

**Web** (`tradiee-app/app/(dashboard)/jobs/[id]/client.tsx`) — same: a
Messages panel on the job detail page, next to the existing notes. The
"Add ▾ → Note" dropdown item (2026-07-23 session) gains a sibling.

**Deliberately not built:** a global cross-job DM inbox. Messages hang off a
job or they don't exist — that's what makes "where's the gate code" findable
six months later, and it matches how everything else in this app is
organised. If someone wants app-wide DMs later, that's a different feature
with a different table.

## Push-notification tap target

`app/_layout.tsx` already routes notification taps by `data.screen` (the
`inbox_message` category from the SMS work). Add a `job_message` category
routing to `/jobs/[id]`, plus the same Reply quick-action if it's cheap —
the pattern is already there for `inbox_message`.

## Rough order

1. Migration (`kind` column + `job_thread_reads`) — small, no PowerSync work.
2. Filter the 3 read sites so chatter can't reach the job sheet. **Do this in
   the same commit as (1)** — the window where `kind` exists but the PDF
   doesn't filter is exactly when a bad row leaks onto a customer-visible doc.
3. `notifyJobThread()` + `POST /api/jobs/[id]/messages`.
4. Mobile thread UI + notification routing (the highest-value half — the
   technician is the one who benefits).
5. Web panel.
6. Unread badges last (needs 1-5 to be useful, and is the easiest to defer).

Steps 1-4 are the shippable product. 5-6 are polish.

## Open questions

- Messages on the job sheet PDF: yes or no? (default: no, see above)
- Should a message notify *all* assignees or only the primary? (default: all —
  `job_assignees` exists precisely because multi-worker jobs are real)
- Retention: messages are `on delete cascade` from the job, same as notes. Fine
  unless someone wants chatter purged separately from the job record.
