-- SMS number-pool session routing (shared dedicated numbers across tenants).
-- The pool numbers themselves are env config (CLICKSEND_POOL_NZ/AU — a
-- handful of numbers, changes rarely, no table needed), but which pool
-- number is talking to which (company, customer) pair is real, growing state.
--
-- Sticky by design: NO fixed expiry. A session is created once per
-- (company_id, customer_phone) pair and reused forever, touched on every
-- send/receive. This is deliberate — a TTL-based pool would let a number get
-- reassigned to an unrelated tenant while the original customer still has it
-- saved in their phone; if they text back after the "expiry" window, that
-- message would get evaluated against the WRONG company's customer table.
-- Sticky-forever avoids that failure mode entirely; the only remaining
-- "unmapped" case is a genuinely cold text to a pool number with no prior
-- session at all, which the inbound webhook handles with a generic auto-reply
-- (no company attribution possible or needed).
create table if not exists sms_pool_sessions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  customer_phone    text not null,  -- E.164
  pool_number       text not null,  -- E.164, one of CLICKSEND_POOL_NZ/AU
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- One sticky pool-number assignment per (company, customer) pair.
create unique index if not exists sms_pool_sessions_company_customer_idx
  on sms_pool_sessions (company_id, customer_phone);

-- The actual collision guard: a given pool number can serve MANY different
-- customer phones concurrently (that's the whole point of pooling), but the
-- exact same customer phone must never be mapped to that SAME pool number by
-- two different companies at once — that's the only case an inbound message
-- (identified by from=customer, to=pool number) would be ambiguous.
create unique index if not exists sms_pool_sessions_number_customer_idx
  on sms_pool_sessions (pool_number, customer_phone);

create index if not exists sms_pool_sessions_activity_idx
  on sms_pool_sessions (pool_number, last_activity_at);

alter table sms_pool_sessions enable row level security;
-- Backend-only routing state (lib/sms.ts, the inbound webhook) — no
-- self-service company access needed, so no policies; the service-role
-- client used everywhere it's touched bypasses RLS.
