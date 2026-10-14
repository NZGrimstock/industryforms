-- companies.referred_by_company_id (20260817110000_referral_program.sql) is a self-referencing
-- FK with no index, so every company DELETE seq-scans all of companies to check nobody was
-- referred by it. Found during the 2026-10-15 spam-signup cleanup, where deleting 155k fake
-- trials timed out on exactly this check. Also index the other unindexed FKs to companies.
create index if not exists companies_referred_by_company_id_idx on public.companies (referred_by_company_id);
create index if not exists job_invitations_contractor_company_id_idx on public.job_invitations (contractor_company_id);
create index if not exists job_links_contractor_company_id_idx on public.job_links (contractor_company_id);
create index if not exists job_links_subcontractor_company_id_idx on public.job_links (subcontractor_company_id);
