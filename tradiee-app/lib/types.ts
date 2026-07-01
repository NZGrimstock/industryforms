export type UserRole = 'owner' | 'admin' | 'staff'
export type CustomerType = 'residential' | 'commercial'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export type JobStatus = 'unscheduled' | 'scheduled' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'void'
export type LineItemType = 'labour' | 'material' | 'misc' | 'section_header'
export type PaymentMethod = 'stripe' | 'bank_transfer' | 'cash' | 'cheque' | 'other'

export interface Company {
  id: string
  name: string
  trade_type: string | null
  country: string
  gst_number: string | null
  default_gst_rate: number
  logo_url: string | null
  brand_color: string | null
  theme_accent: string | null
  review_link: string | null
  review_request_enabled: boolean
  standard_markup_enabled?: boolean
  standard_markup_pct?: number
  email: string | null
  phone: string | null
  address: string | null
  stripe_customer_id: string | null
  subscription_plan: string
  subscription_status: string
  trial_ends_at: string | null
  xero_tenant_id: string | null
  xero_access_token: string | null
  xero_refresh_token: string | null
  xero_token_expires_at: string | null
  default_project_stages: string[] | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  company_id: string
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  hourly_cost_rate: number | null
  hourly_bill_rate: number | null
  is_active: boolean
  avatar_url: string | null
  google_access_token: string | null
  google_refresh_token: string | null
  google_token_expiry: string | null
  google_calendar_id: string | null
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  company_id: string
  type: CustomerType
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  notes: string | null
  is_active?: boolean
  archived_at?: string | null
  created_at: string
  updated_at: string
}

export interface CustomerSite {
  id: string
  customer_id: string
  label: string | null
  address: string
  lat: number | null
  lng: number | null
  access_notes: string | null
  created_at: string
}

export interface PriceListItem {
  id: string
  company_id: string
  type: LineItemType
  code: string | null
  name: string
  description: string | null
  unit: string
  cost_price: number
  sell_price: number
  default_markup_pct: number | null
  supplier_name: string | null
  quantity_on_hand: number | null
  low_stock_threshold: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Kit {
  id: string
  company_id: string
  name: string
  description: string | null
  created_at: string
  kit_items?: KitItem[]
}

export interface KitItem {
  id: string
  kit_id: string
  price_list_item_id: string
  quantity: number
  sort_order: number
  price_list_items?: PriceListItem
}

export interface Quote {
  id: string
  company_id: string
  customer_id: string
  site_id: string | null
  created_by: string | null
  quote_number: string
  title: string
  status: QuoteStatus
  subtotal: number
  discount_type: 'amount' | 'percent' | null
  discount_value: number
  discount_amount: number
  gst_amount: number
  total: number
  notes: string | null
  customer_message: string | null
  terms: string | null
  public_token: string
  sent_at: string | null
  viewed_at: string | null
  expires_at: string | null
  accepted_at: string | null
  declined_at: string | null
  converted_to_job_id: string | null
  created_at: string
  updated_at: string
  customers?: Customer
  customer_sites?: CustomerSite | null
}

export interface QuoteSection {
  id: string
  quote_id: string
  title: string
  is_optional: boolean
  customer_selected: boolean | null
  sort_order: number
  quote_line_items?: QuoteLineItem[]
}

export interface QuoteLineItem {
  id: string
  quote_id: string
  section_id: string | null
  price_list_item_id: string | null
  type: LineItemType
  description: string
  quantity: number
  unit: string
  unit_cost: number
  unit_price: number
  discount_type: 'amount' | 'percent' | null
  discount_value: number
  tax_rate: number | null
  line_total: number
  sort_order: number
  created_at: string
}

export interface Job {
  id: string
  company_id: string
  customer_id: string
  site_id: string | null
  quote_id: string | null
  job_number: string
  title: string
  description: string | null
  status: JobStatus
  is_recurring: boolean
  recurrence_rule: string | null
  assigned_to: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  customers?: Customer
  profiles?: Profile | null
  customer_sites?: CustomerSite | null
}

export interface JobVisit {
  id: string
  job_id: string
  assigned_to: string | null
  scheduled_start: string
  scheduled_end: string
  actual_start: string | null
  actual_end: string | null
  status: VisitStatus
  notes: string | null
  created_at: string
  updated_at: string
  profiles?: Profile | null
  jobs?: Job
}

export interface JobNote {
  id: string
  job_id: string
  author_id: string | null
  body: string
  created_at: string
  profiles?: Profile | null
}

export interface JobPhoto {
  id: string
  job_id: string
  uploaded_by: string | null
  storage_path: string
  caption: string | null
  taken_at: string
}

export interface Timesheet {
  id: string
  company_id: string
  job_id: string | null
  visit_id: string | null
  profile_id: string
  started_at: string
  ended_at: string | null
  break_minutes: number
  bill_rate: number | null
  cost_rate: number | null
  notes: string | null
  is_billable: boolean
  created_at: string
  updated_at: string
  profiles?: Profile
  jobs?: Job | null
}

export interface Invoice {
  id: string
  company_id: string
  customer_id: string
  job_id: string | null
  invoice_number: string
  status: InvoiceStatus
  is_progress_invoice: boolean
  progress_sequence: number | null
  subtotal: number
  discount_type: 'amount' | 'percent' | null
  discount_value: number
  discount_amount: number
  gst_amount: number
  total: number
  amount_paid: number
  notes: string | null
  terms: string | null
  due_date: string | null
  public_token: string
  sent_at: string | null
  viewed_at: string | null
  paid_at: string | null
  external_system: string | null
  external_id: string | null
  external_synced_at: string | null
  created_at: string
  updated_at: string
  customers?: Customer
  jobs?: Job | null
}

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  price_list_item_id: string | null
  timesheet_id: string | null
  type: LineItemType
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_type: 'amount' | 'percent' | null
  discount_value: number
  tax_rate: number | null
  line_total: number
  sort_order: number
  created_at: string
}

export interface Payment {
  id: string
  invoice_id: string
  amount: number
  method: PaymentMethod
  stripe_payment_intent_id: string | null
  paid_at: string
  notes: string | null
  created_at: string
}

export interface Reminder {
  id: string
  company_id: string
  quote_id: string | null
  invoice_id: string | null
  type: string
  channel: string
  scheduled_for: string
  sent_at: string | null
  created_at: string
}
