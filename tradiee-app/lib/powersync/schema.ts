import { column, Schema, Table } from '@powersync/web'

const jobs = new Table({
  company_id: column.text,
  customer_id: column.text,
  job_number: column.text,
  title: column.text,
  description: column.text,
  status: column.text,
  assigned_to: column.text,
  site_id: column.text,
  quote_id: column.text,
  tags: column.text,
  created_at: column.text,
  updated_at: column.text,
  // Migration 20260815100000 — the fully-invoiced lock escape hatch.
  invoice_lock_override: column.integer,
})

const customers = new Table({
  company_id: column.text,
  name: column.text,
  email: column.text,
  phone: column.text,
})

const customer_sites = new Table({
  company_id: column.text,
  customer_id: column.text,
  name: column.text,
  address: column.text,
})

const job_visits = new Table({
  job_id: column.text,
  assigned_to: column.text,
  scheduled_start: column.text,
  scheduled_end: column.text,
  status: column.text,
  notes: column.text,
})

const job_assignees = new Table({
  company_id: column.text,
  job_id: column.text,
  profile_id: column.text,
  added_at: column.text,
})

const job_notes = new Table({
  job_id: column.text,
  author_id: column.text,
  body: column.text,
  // 'note' | 'message' — see migration 20260812100000. Local rows synced
  // before that migration may still read null; client queries filtering for
  // notes must tolerate that (`kind is null or kind = 'note'`).
  kind: column.text,
  created_at: column.text,
})

const timesheets = new Table({
  company_id: column.text,
  job_id: column.text,
  profile_id: column.text,
  started_at: column.text,
  ended_at: column.text,
  break_minutes: column.integer,
  bill_rate: column.real,
  cost_rate: column.real,
  is_billable: column.integer,
})

const job_materials = new Table({
  company_id: column.text,
  job_id: column.text,
  description: column.text,
  quantity: column.real,
  unit: column.text,
  unit_cost: column.real,
  unit_price: column.real,
  price_list_item_id: column.text,
  supplier: column.text,
  supplier_invoice_number: column.text,
  created_at: column.text,
})

const form_templates = new Table({
  company_id: column.text,
  name: column.text,
  fields: column.text,
  is_active: column.integer,
})

const form_submissions = new Table({
  job_id: column.text,
  template_id: column.text,
  template_name: column.text,
  answers: column.text,
  submitted_at: column.text,
  submitted_by: column.text,
})

const price_list_items = new Table({
  company_id: column.text,
  name: column.text,
  unit: column.text,
  sell_price: column.real,
  cost_price: column.real,
  type: column.text,
  is_active: column.integer,
})

export const AppSchema = new Schema({
  jobs,
  customers,
  customer_sites,
  job_visits,
  job_assignees,
  job_notes,
  timesheets,
  job_materials,
  form_templates,
  form_submissions,
  price_list_items,
})
