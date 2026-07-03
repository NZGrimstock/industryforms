-- Postgres unique indexes treat NULL <> NULL, so bookings_slot_uniqueness_idx
-- never actually enforced uniqueness for company-wide bookings (assigned_to
-- null — the common case, since booking_availability_rules defaults to
-- profile_id null / "any staff"). Two concurrent holds on the same
-- unassigned slot would both have succeeded. Replace with a coalesce
-- expression index so NULL collides with NULL as intended.
drop index if exists bookings_slot_uniqueness_idx;
create unique index if not exists bookings_slot_uniqueness_idx
  on bookings(company_id, coalesce(assigned_to, '00000000-0000-0000-0000-000000000000'::uuid), starts_at)
  where status in ('slot_held', 'requested', 'deposit_pending', 'confirmed', 'scheduled');
