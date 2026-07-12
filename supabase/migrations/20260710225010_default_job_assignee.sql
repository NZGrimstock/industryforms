alter table public.companies
  add column if not exists default_job_assignee_id uuid references public.profiles(id) on delete set null;

create index if not exists companies_default_job_assignee_idx
  on public.companies(default_job_assignee_id);
