import { column, Schema, Table } from '@powersync/react-native'

// Mirror the tables needed offline — matches web app's lib/powersync/schema.ts
const jobs = new Table({
  company_id: column.text,
  customer_id: column.text,
  job_number: column.text,
  title: column.text,
  description: column.text,
  status: column.text,
  assigned_to: column.text,
  site_id: column.text,
  created_at: column.text,
  updated_at: column.text,
})

const customers = new Table({
  company_id: column.text,
  name: column.text,
  type: column.text,
  contact_person: column.text,
  email: column.text,
  phone: column.text,
  billing_address: column.text,
})

const customer_sites = new Table({
  customer_id: column.text,
  label: column.text,
  address: column.text,
  lat: column.real,
  lng: column.real,
  access_notes: column.text,
  created_at: column.text,
})

const job_visits = new Table({
  job_id: column.text,
  assigned_to: column.text,
  scheduled_start: column.text,
  scheduled_end: column.text,
  actual_start: column.text,
  actual_end: column.text,
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
  notes: column.text,
  is_billable: column.integer,
})

const job_materials = new Table({
  job_id: column.text,
  company_id: column.text,
  description: column.text,
  quantity: column.real,
  unit: column.text,
  unit_cost: column.real,
  unit_price: column.real,
  created_at: column.text,
})

const form_templates = new Table({
  company_id: column.text,
  name: column.text,
  description: column.text,
  fields: column.text,
  is_active: column.integer,
})

const form_submissions = new Table({
  job_id: column.text,
  company_id: column.text,
  template_id: column.text,
  template_name: column.text,
  answers: column.text,
  submitted_at: column.text,
})

const price_list_items = new Table({
  company_id: column.text,
  name: column.text,
  unit: column.text,
  sell_price: column.real,
  cost_price: column.real,
  category: column.text,
  is_active: column.integer,
})

const travel_logs = new Table({
  company_id:  column.text,
  profile_id:  column.text,
  started_at:  column.text,
  ended_at:    column.text,
  start_lat:   column.real,
  start_lng:   column.real,
  end_lat:     column.real,
  end_lng:     column.real,
  distance_km: column.real,
  purpose:     column.text,
  job_id:      column.text,
  notes:       column.text,
  is_auto:     column.integer,
  created_at:  column.text,
})

const projects = new Table({
  company_id: column.text,
  customer_id: column.text,
  project_manager_id: column.text,
  name: column.text,
  description: column.text,
  status: column.text,
  total_budget: column.real,
  start_date: column.text,
  target_end_date: column.text,
  reference: column.text,
  created_at: column.text,
  updated_at: column.text,
})

const project_stages = new Table({
  project_id: column.text,
  name: column.text,
  description: column.text,
  sort_order: column.integer,
  status: column.text,
  target_end_date: column.text,
  completed_at: column.text,
  created_at: column.text,
  updated_at: column.text,
})

const quotes = new Table({
  company_id:       column.text,
  customer_id:      column.text,
  site_id:          column.text,
  created_by:       column.text,
  quote_number:     column.text,
  title:            column.text,
  status:           column.text,
  subtotal:         column.real,
  gst_amount:       column.real,
  total:            column.real,
  notes:            column.text,
  customer_message: column.text,
  terms:            column.text,
  expires_at:       column.text,
  sent_at:          column.text,
  accepted_at:      column.text,
  declined_at:      column.text,
  converted_to_job_id: column.text,
  created_at:       column.text,
  updated_at:       column.text,
})

const quote_sections = new Table({
  quote_id:          column.text,
  title:             column.text,
  is_optional:       column.integer,
  customer_selected: column.integer,
  sort_order:        column.integer,
})

const quote_line_items = new Table({
  quote_id:           column.text,
  section_id:         column.text,
  price_list_item_id: column.text,
  type:               column.text,
  description:        column.text,
  quantity:           column.real,
  unit:               column.text,
  unit_cost:          column.real,
  unit_price:         column.real,
  line_total:         column.real,
  sort_order:         column.integer,
  created_at:         column.text,
})

const invoices = new Table({
  company_id:          column.text,
  customer_id:         column.text,
  job_id:              column.text,
  invoice_number:      column.text,
  status:              column.text,
  is_progress_invoice: column.integer,
  progress_sequence:   column.integer,
  subtotal:            column.real,
  gst_amount:          column.real,
  total:               column.real,
  amount_paid:         column.real,
  notes:               column.text,
  terms:               column.text,
  due_date:            column.text,
  invoice_date:        column.text,
  sent_at:             column.text,
  paid_at:             column.text,
  discount_type:       column.text,
  discount_value:      column.real,
  discount_amount:     column.real,
  is_recurring:        column.integer,
  recurrence_rule:     column.text,
  recurrence_next:     column.text,
  recurrence_end:      column.text,
  created_at:          column.text,
  updated_at:          column.text,
})

const invoice_line_items = new Table({
  invoice_id:         column.text,
  price_list_item_id: column.text,
  timesheet_id:       column.text,
  type:               column.text,
  description:        column.text,
  quantity:           column.real,
  unit:               column.text,
  unit_price:         column.real,
  line_total:         column.real,
  sort_order:         column.integer,
  created_at:         column.text,
})

const job_photos = new Table({
  job_id:       column.text,
  company_id:   column.text,
  uploaded_by:  column.text,
  storage_path: column.text,
  caption:      column.text,
  taken_at:     column.text,
})

// Unified inbox (Mobile Overhaul brief §11) — reads offline via PowerSync;
// writes (reply, triage) go through the web APIs and reconcile on next sync.
const enquiries = new Table({
  company_id:     column.text,
  customer_name:  column.text,
  customer_email: column.text,
  customer_phone: column.text,
  address:        column.text,
  description:    column.text,
  source:         column.text,
  status:         column.text,
  assigned_to:    column.text,
  notes:          column.text,
  follow_up_at:   column.text,
  created_at:     column.text,
  updated_at:     column.text,
})

const customer_messages = new Table({
  company_id:  column.text,
  customer_id: column.text,
  direction:   column.text,
  body:        column.text,
  from_number: column.text,
  to_number:   column.text,
  read_at:     column.text,
  assigned_to: column.text,
  status:      column.text,
  source:      column.text,
  created_at:  column.text,
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
  travel_logs,
  projects,
  project_stages,
  quotes,
  quote_sections,
  quote_line_items,
  invoices,
  invoice_line_items,
  job_photos,
  enquiries,
  customer_messages,
})

export type Database = (typeof AppSchema)['types']
