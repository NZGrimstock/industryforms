-- Bill-through subcontractor billing bridge: once a subbie's linked job
-- (see 021_job_invitations.sql) is completed, the contractor can pull the
-- agreed price onto their own job as a materials line (in the seeded
-- "Subcontractors" cost category), which then flows into their normal
-- client invoice like any other job cost. This is the "house build" model
-- where subbies bill the main contractor, not the client. Direct-to-client
-- billing (a reno subbie invoicing the client themselves) is a separate,
-- not-yet-built model — see PROJECT_STATE.md.
--
-- contractor_material_id tracks whether the line has already been pulled in,
-- so the button on the contractor's job page can flip from "Add to job
-- cost" to "Added" and never double-insert.
alter table job_links add column contractor_material_id uuid references job_materials(id) on delete set null;

-- job_links had select policies for both parties and an insert policy for
-- the service role (set on invitation acceptance), but no update policy —
-- the contractor company needs one to set contractor_material_id.
create policy "contractors update their job_links" on job_links
  for update using (
    contractor_company_id in (select company_id from profiles where id = auth.uid())
  )
  with check (
    contractor_company_id in (select company_id from profiles where id = auth.uid())
  );
