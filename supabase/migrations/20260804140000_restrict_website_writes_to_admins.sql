-- company_websites insert/update were open to ANY company member
-- (`company_id = current_company_id()` with no role check), while the delete
-- policy already required is_admin_or_owner(). Two consequences:
--
--   1. A `staff`-role user could rewrite the public marketing site of the
--      company they work for — including the section content that is rendered
--      on the public page and embedded in its JSON-LD.
--   2. `is_published` is just a column on this table, so the same staff user
--      could flip the site live by writing the row directly, bypassing the
--      Bookings Website add-on paywall that is only enforced in the builder UI
--      (`canPublish` gates the button, not the write).
--
-- The builder page itself has no role gate either, so this was reachable
-- without crafting a raw API call. Align writes with the existing delete
-- policy: owner/admin only.

drop policy if exists "company members can insert their website" on company_websites;
drop policy if exists "company members can update their website" on company_websites;

create policy "admins insert their website" on company_websites
  for insert with check (company_id = current_company_id() and is_admin_or_owner());

create policy "admins update their website" on company_websites
  for update using (company_id = current_company_id() and is_admin_or_owner())
  with check (company_id = current_company_id() and is_admin_or_owner());
