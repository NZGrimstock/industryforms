-- Suppliers + Purchase Orders (procurement)

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  account_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suppliers_company_idx on suppliers(company_id);

do $$ begin
  create type purchase_order_status as enum ('draft', 'sent', 'received', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  po_number text not null,
  status purchase_order_status not null default 'draft',
  order_date date not null default current_date,
  expected_date date,
  subtotal numeric(12,2) not null default 0,
  gst_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references profiles(id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists purchase_orders_company_idx on purchase_orders(company_id);
create index if not exists purchase_orders_supplier_idx on purchase_orders(supplier_id);
create index if not exists purchase_orders_job_idx on purchase_orders(job_id);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  price_list_item_id uuid references price_list_items(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit text not null default 'each',
  unit_cost numeric(10,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists purchase_order_items_po_idx on purchase_order_items(purchase_order_id);

alter table suppliers enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;

create policy "company members manage suppliers" on suppliers
  for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy "company members manage purchase_orders" on purchase_orders
  for all using (company_id = current_company_id()) with check (company_id = current_company_id());
create policy "company members manage purchase_order_items" on purchase_order_items
  for all using (company_id = current_company_id()) with check (company_id = current_company_id());

grant all on table suppliers to anon, authenticated, service_role;
grant all on table purchase_orders to anon, authenticated, service_role;
grant all on table purchase_order_items to anon, authenticated, service_role;
