import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { presignedDownload } from '@/lib/r2'
import { nextDocNumber } from '@/lib/numbering'
import { getJobStatuses } from '@/lib/job-statuses'
import { RecurringJobCard } from './recurring-card'
import { JobTasksCard } from './tasks-card'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatDateTime, formatCurrency, quoteLabel } from '@/lib/utils'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { FinancialStatBox, type FinancialStat } from '@/components/ui/financial-stat-box'
import { summarizeInvoices, jobTotal, toInvoice, invoiceGuard, approvedVariationTotal } from '@/lib/job-financials'
import { round2, lineNet } from '@/lib/pricing'
import { effectivePlanKey } from '@/lib/billing'
import { JobDetailClient } from './client'
import { JobMessagesCard, type JobMessage } from './messages-card'
import { JobLockBanner } from './lock-banner'
import { JobMaterials } from './materials'
import { JobVariations } from './variations'
import { getCostCategories } from '@/lib/cost-categories'
import { OrderMaterialsButton } from '@/components/purchase-orders/order-materials-button'
import { JobPhotoUpload } from '@/components/ui/photo-upload'
import { ProfitabilityBadge } from '@/components/ui/profitability-badge'
import { SupplierInvoiceParser } from '@/components/ui/supplier-invoice-parser'
import { FormFill } from '@/components/ui/form-fill'
import { ProgressClaims } from '@/components/ui/progress-claims'
import { ComplianceDocs } from '@/components/compliance/ComplianceDocs'
import { SubcontractorStatus } from '@/components/jobs/SubcontractorStatus'
import { JobAssigneesCard } from './assignees'
import { VisitsCard } from './visits-card'
import { PrevNextNav } from '@/components/ui/prev-next-nav'
import { JobSiteSelector } from '@/components/jobs/job-site-selector'
import { TimesheetTable } from '@/components/timesheets/timesheet-table'
import Link from 'next/link'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(name, phone, email, address, gst_number, default_gst_rate, prices_include_tax, logo_url, country, standard_markup_enabled, standard_markup_pct, job_material_markup_enabled, subscription_plan, subscription_status, trial_ends_at, billing_exempt)').eq('id', user!.id).single()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*, customers(name, email, phone), customer_sites!site_id(address), profiles!assigned_to(full_name), quotes!quote_id(quote_number, total, is_estimate)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (jobError) console.error('[job detail]', jobError.message)

  if (!job) notFound()

  // Everything below only depends on `job` (customer_id/quote_id) or
  // `profile.company_id`/`id` — none of it depends on any other query's
  // result, so it all runs as one parallel wave instead of the previous
  // ~8 sequential round trips (each one paying full Supabase latency).
  const [
    customerSitesRes, visitsRes, notesRes, timesheetsRes, invoicesRes, teamRes, materialsRes, purchaseOrdersRes, priceItemsRes, kitsRes, photosRes, formTemplatesRes, formSubmissionsRes, claimsRes, complianceDocsRes,
    jobAssigneesRes, jobStatuses, nextInvoiceNumber, qLinesRes, jobsForPickerRes, messagesRes, variationsRes, costCategories,
  ] = await Promise.all([
    supabase.from('customer_sites').select('id, address, label').eq('customer_id', job.customer_id).order('created_at'),
    supabase.from('job_visits').select('*, profiles(full_name)').eq('job_id', id).order('scheduled_start'),
    // Notes and messages share the job_notes table, split by `kind` (migration
    // 20260812100000). Messages must never reach `sheetData` below — the job
    // sheet is a printed document and admin↔tech chatter doesn't belong on it.
    supabase.from('job_notes').select('*, profiles(full_name)').eq('job_id', id).eq('kind', 'note').order('created_at', { ascending: false }),
    supabase.from('timesheets').select('*, profiles(full_name)').eq('job_id', id).order('started_at', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, subtotal').eq('job_id', id),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true),
    supabase.from('job_materials').select('*').eq('job_id', id).order('created_at'),
    supabase.from('purchase_orders').select('id, po_number, status').eq('job_id', id).order('po_number'),
    // Materials picker only — labour and sundries/misc are tracked via timesheets
    // and invoice lines, and must never end up in job_materials (they'd then be
    // ordered from a supplier on a PO).
    supabase.from('price_list_items').select('id, code, name, unit, sell_price, cost_price, type, quantity_on_hand').eq('company_id', profile!.company_id).eq('is_active', true).not('type', 'in', '("labour","misc")').order('name'),
    supabase.from('kits').select('*, kit_items(*, price_list_items(*))').eq('company_id', profile!.company_id).order('name'),
    supabase.from('job_photos').select('id, storage_path, caption, created_at').eq('job_id', id).order('created_at'),
    supabase.from('form_templates').select('id, name, fields').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('form_submissions').select('id, template_name, submitted_at, answers').eq('job_id', id).order('created_at'),
    supabase.from('progress_claims').select('*').eq('job_id', id).order('stage_number'),
    supabase.from('compliance_documents').select('id, doc_number, doc_type, ac_form_code, project_address, status, created_at, pdf_path').eq('job_id', id).order('created_at', { ascending: false }),
    supabase.from('job_assignees').select('id, profile_id, profiles(full_name, job_title)').eq('job_id', id),
    getJobStatuses(supabase, profile!.company_id),
    nextDocNumber(supabase, profile!.company_id, 'invoice'),
    job.quote_id
      ? supabase.from('quote_line_items').select('quantity, unit_price, unit_cost, line_total, description, unit, type, price_list_item_id, sort_order').eq('quote_id', job.quote_id).order('sort_order')
      : Promise.resolve({ data: null }),
    supabase.from('jobs').select('id, job_number, title').eq('company_id', profile!.company_id).order('job_number'),
    // Ascending — a conversation reads oldest-first, unlike the notes list.
    supabase.from('job_notes').select('id, body, author_id, created_at, profiles(full_name)').eq('job_id', id).eq('kind', 'message').order('created_at', { ascending: true }),
    supabase.from('variations').select('*, variation_items(*)').eq('job_id', id).order('created_at'),
    getCostCategories(supabase, profile!.company_id),
  ])

  const customerSites = customerSitesRes.data

  // Build signed URLs for compliance doc PDFs (private R2 bucket)
  const complianceDocs = complianceDocsRes.data ?? []
  const compliancePdfUrls: Record<string, string> = {}
  if (complianceDocs.length > 0) {
    await Promise.all(
      complianceDocs
        .filter(d => d.pdf_path)
        .map(async d => {
          compliancePdfUrls[d.id] = await presignedDownload(d.pdf_path!, 60 * 60 * 24) // 24h
        })
    )
  }

  const jobPurchaseOrders = purchaseOrdersRes.data ?? []

  const companySettings = profile!.companies as { standard_markup_enabled?: boolean; standard_markup_pct?: number; job_material_markup_enabled?: boolean } | null
  const canMarkupItems = !!companySettings?.job_material_markup_enabled && (profile!.role === 'owner' || profile!.role === 'admin')
  const normalizedJobAssignees = (jobAssigneesRes.data ?? []).map(a => {
    const assigneeProfile = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
    return {
      id: a.id,
      profile_id: a.profile_id,
      profiles: {
        full_name: assigneeProfile?.full_name ?? 'Unknown worker',
        job_title: assigneeProfile?.job_title ?? null,
      },
    }
  })

  const profileHasSignature = !!((profile as Record<string, unknown>).signature_base64)

  const gstRate = (profile?.companies as {default_gst_rate: number} | null)?.default_gst_rate ?? 0.15
  const pricesIncludeTax = !!(profile?.companies as {prices_include_tax?: boolean} | null)?.prices_include_tax

  // Actual line items for "invoice from actuals" (logged materials + billable
  // labour) — computed early because it now also backs "Job total" for a job
  // with no quote (see below): the total must come from the job itself, not
  // require a quote that may never exist for a time-and-materials job.
  const actualMaterialLines = (materialsRes.data ?? [])
    .filter(m => Number(m.unit_price) > 0)
    .map(m => ({
      description: m.description as string,
      quantity: Number(m.quantity),
      unit: (m.unit as string) ?? 'each',
      unit_price: Number(m.unit_price),
      type: 'material' as const,
    }))
  // Group billable timesheet hours by bill rate (net of breaks)
  const labourByRate = new Map<number, number>()
  for (const t of timesheetsRes.data ?? []) {
    if (!t.is_billable || !t.bill_rate || !t.ended_at) continue
    const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000 - Number(t.break_minutes ?? 0) / 60
    if (hrs <= 0) continue
    labourByRate.set(Number(t.bill_rate), (labourByRate.get(Number(t.bill_rate)) ?? 0) + hrs)
  }
  const actualLabourLines = [...labourByRate.entries()].map(([rate, hrs]) => ({
    description: 'Labour',
    quantity: Math.round(hrs * 100) / 100,
    unit: 'hr',
    unit_price: rate,
    type: 'labour' as const,
  }))
  const actualLines = [...actualMaterialLines, ...actualLabourLines]
  // Net of GST when the company enters tax-inclusive prices — job_materials/
  // timesheets have no separate net line_total column like quote_line_items
  // does, so unit_price is the only source; lineNet() strips the tax portion
  // the same way quote-builder.tsx does for quote lines (see lineNet() in
  // lib/pricing.ts). Previously this always treated unit_price as already-net
  // and then GST got added on top a second time downstream.
  const actualTotal = actualLines.reduce((sum, l) => sum + lineNet(l.quantity, l.unit_price, null, 0, gstRate, pricesIncludeTax), 0)

  // Job costing: estimated from the quote when the job has one; otherwise
  // from the job's own logged materials + billable labour (actualTotal) —
  // a quote-less time-and-materials job still has a real total once work is
  // logged against it, it just isn't a pre-agreed ceiling.
  let estimatedSubtotal = 0
  let quoteLineItems: Array<{ description: string; quantity: number; unit: string; unit_price: number; line_total: number }> = []
  let quoteFillLines: Array<{ description: string; quantity: number; unit: string; unit_cost: number; unit_price: number; type: string; price_list_item_id: string | null }> = []
  if (job.quote_id) {
    const qLines = (qLinesRes as { data: Array<{ quantity: number; unit_price: number; unit_cost: number | null; line_total: number; description: string | null; unit: string | null; type: string | null; price_list_item_id: string | null }> | null }).data
    quoteLineItems = (qLines ?? []).map(l => ({
      description: l.description ?? '',
      quantity: Number(l.quantity),
      unit: l.unit ?? 'each',
      unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
    }))
    quoteFillLines = (qLines ?? []).map(l => ({
      description: l.description ?? '',
      quantity: Number(l.quantity),
      unit: l.unit ?? 'each',
      unit_cost: Number(l.unit_cost ?? 0),
      unit_price: Number(l.unit_price),
      type: l.type ?? 'material',
      price_list_item_id: l.price_list_item_id ?? null,
    }))
    // Sum the stored net line_total, not quantity*unit_price — unit_price is
    // the raw entered figure, which IS GST-inclusive when the company has
    // "Prices include GST" on (see quote-builder.tsx's netOf()/lineNet()).
    // line_total is already tax-extracted at quote-save time regardless of
    // entry mode, so summing it is the only way this stays GST-exclusive.
    estimatedSubtotal = (qLines ?? []).reduce((sum, l) => sum + Number(l.line_total), 0)
  } else {
    estimatedSubtotal = actualTotal
  }
  const actualLabour = (timesheetsRes.data ?? []).reduce((sum, t) => {
    if (!t.is_billable || !t.bill_rate || !t.ended_at) return sum
    const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000
    return sum + hrs * Number(t.bill_rate)
  }, 0)

  const materialsCost = (materialsRes.data ?? []).reduce((sum, m) => sum + Number(m.quantity) * Number(m.unit_cost ?? 0), 0)
  // By-category breakdown of the same materialsCost figure, only shown when
  // at least one line actually has a category set — most jobs won't bother,
  // and an all-"Uncategorised" list would just be noise.
  const materialsCostByCategory = (() => {
    const byId = new Map<string, number>()
    for (const m of materialsRes.data ?? []) {
      if (!m.cost_category_id) continue
      byId.set(m.cost_category_id, (byId.get(m.cost_category_id) ?? 0) + Number(m.quantity) * Number(m.unit_cost ?? 0))
    }
    return costCategories
      .map(c => ({ name: c.name, amount: byId.get(c.id) ?? 0 }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  })()
  const labourCost = (timesheetsRes.data ?? []).reduce((sum, t) => {
    if (!t.ended_at) return sum
    const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000
    return sum + hrs * Number(t.cost_rate ?? t.bill_rate ?? 0)
  }, 0)
  const totalPaid = (invoicesRes.data ?? []).reduce((sum, i) => sum + Number(i.amount_paid ?? 0), 0)
  const totalInvoiced = (invoicesRes.data ?? []).reduce((sum, i) => sum + Number(i.total ?? 0), 0)

  // At-a-glance financial box (top of page) — distinct from the Job Costing
  // card further down: this excludes void invoices (summarizeInvoices) and
  // compares against the quote's GST-inclusive total, not the excl.-GST
  // estimate the costing card uses. For a quote-less job, fall back to the
  // same job-sourced estimate (converted to GST-inclusive) rather than $0 —
  // "Job total" must come from the job, not require a quote.
  const jobQuote = job.quotes as unknown as { quote_number: string; total: number; is_estimate: boolean } | null
  const jobSourcedCeiling = job.quote_id ? undefined : (actualTotal > 0 ? round2(actualTotal * (1 + gstRate)) : undefined)
  const { invoiced: financialInvoiced, paid: financialPaid, outstanding: financialOutstanding } = summarizeInvoices(invoicesRes.data ?? [])
  // Tax-inclusive totals on this path (summarizeInvoices sums invoice.total),
  // so variations contribute their inclusive total too.
  const variations = variationsRes.data ?? []
  const approvedVariations = approvedVariationTotal(variations.map(v => ({ status: v.status, amount: v.total })))
  const financialJobTotal = jobTotal(jobQuote?.total ?? jobSourcedCeiling, financialInvoiced, approvedVariations)
  const financialToInvoice = toInvoice(financialJobTotal, financialInvoiced)
  // Same predicate as invoiceGuard()'s 'fully-invoiced' branch — kept in sync
  // deliberately (see lib/job-financials.ts comment) rather than duplicated
  // ad hoc, since the DB trigger (migration 20260815100000) enforces the real
  // lock; this is only for the UI banner and disabling the unlock toggle.
  // Uses jobQuote?.total directly, NOT financialJobTotal — job_is_locked()
  // only ever locks a job that has a quote (returns false when quote_total is
  // null), so this must mirror that exactly rather than the job-sourced
  // fallback above, or a quote-less job could show a "locked" banner the
  // database was never going to enforce.
  // Approved variations are added here too — job_is_locked() counts them, so a
  // job with signed-off extra work must stop showing the locked banner.
  const jobLocked = invoiceGuard({
    jobTotal: jobQuote ? Number(jobQuote.total) + approvedVariations : 0,
    alreadyInvoiced: financialInvoiced,
    subtotal: 0,
  }) === 'fully-invoiced' && !job.invoice_lock_override
  const jobFinancialStats: FinancialStat[] = [
    { label: 'Job total', value: financialJobTotal },
    { label: 'Invoiced', value: financialInvoiced },
    { label: 'To invoice', value: financialToInvoice },
    { label: 'Paid', value: financialPaid, accent: 'good' },
    { label: 'Outstanding', value: financialOutstanding, accent: financialOutstanding > 0 ? 'warn' : 'neutral' },
  ]
  // Sum of invoiced value excl. GST (excluding voided invoices) — used to prevent over-invoicing
  const liveInvoices = (invoicesRes.data ?? []).filter(i => i.status !== 'void')
  const alreadyInvoiced = liveInvoices.reduce((sum, i) => sum + Number(i.subtotal ?? 0), 0)
  // Newest live invoice — what the "already fully invoiced" prompt links to.
  // invoicesRes has no explicit order, so pick by invoice_number rather than
  // trusting row order.
  const existingInvoice = liveInvoices.length > 0
    ? [...liveInvoices].sort((a, b) => String(b.invoice_number).localeCompare(String(a.invoice_number)))
        .map(i => ({ id: i.id as string, invoice_number: i.invoice_number as string }))[0]
    : null

  const co = profile?.companies as {
    name: string; phone: string | null; email: string | null; address: string | null; logo_url: string | null; gst_number: string | null; default_gst_rate: number; country: string
    subscription_plan: string | null; subscription_status: string | null; trial_ends_at: string | null; billing_exempt: boolean | null
  } | null
  const isNZ = (co?.country ?? 'NZ') === 'NZ'
  const currency = co?.country === 'AU' ? 'AUD' : 'NZD'
  const isFreePlan = effectivePlanKey(co) === 'free'
  const sheetData = {
    job: {
      id: job.id,
      job_number: job.job_number,
      title: job.title,
      status: job.status,
      description: job.description,
      created_at: job.created_at,
      tags: job.tags,
      customers: job.customers as { name: string; email: string | null; phone: string | null } | null,
      customer_sites: job.customer_sites as { address: string } | null,
      profiles: job.profiles as { full_name: string } | null,
      quotes: job.quotes as { quote_number: string } | null,
    },
    visits: (visitsRes.data ?? []).map(v => ({
      scheduled_start: v.scheduled_start,
      scheduled_end: v.scheduled_end,
      status: v.status,
      notes: v.notes,
      profiles: v.profiles as { full_name: string } | null,
    })),
    lineItems: quoteLineItems,
    timesheets: (timesheetsRes.data ?? []).map(t => ({
      started_at: t.started_at,
      ended_at: t.ended_at,
      bill_rate: t.bill_rate,
      is_billable: t.is_billable,
      profiles: t.profiles as { full_name: string } | null,
    })),
    notes: (notesRes.data ?? []).map(n => ({
      body: n.body,
      created_at: n.created_at,
      profiles: n.profiles as { full_name: string } | null,
    })),
    company: {
      name: co?.name ?? '',
      phone: co?.phone ?? null,
      email: co?.email ?? null,
      address: co?.address ?? null,
      logo_url: co?.logo_url ?? null,
      gst_number: co?.gst_number ?? null,
      default_gst_rate: co?.default_gst_rate ?? 0.15,
      isFreePlan: effectivePlanKey(co) === 'free',
    },
    timezone: (profile as { timezone?: string | null } | null)?.timezone ?? DEFAULT_TIMEZONE,
  }
  const timezone = sheetData.timezone

  const jobList = jobsForPickerRes.data ?? []
  const jobIdx = jobList.findIndex(j => j.id === id)
  const prevJobHref = jobIdx > 0 ? `/jobs/${jobList[jobIdx - 1].id}` : null
  const nextJobHref = jobIdx >= 0 && jobIdx < jobList.length - 1 ? `/jobs/${jobList[jobIdx + 1].id}` : null

  return (
    <>
      <Header title={`${job.job_number} — ${job.title}`} profile={profile} />
      <div className="p-6 space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{job.title}</h2>
              <StatusBadge status={job.status} />
            </div>
            <p className="text-sm text-gray-500">
              <Link href={`/customers/${job.customer_id}`} className="text-orange-500 hover:underline">
                {(job.customers as {name: string})?.name}
              </Link>
              {job.quotes && <> · From {quoteLabel(jobQuote?.is_estimate).toLowerCase()} <Link href={`/quotes/${job.quote_id}`} className="text-orange-500 hover:underline">{jobQuote?.quote_number}</Link></>}
            </p>
            <JobSiteSelector
              jobId={id}
              customerId={job.customer_id}
              currentSiteId={job.site_id ?? null}
              currentAddress={(job.customer_sites as {address: string} | null)?.address ?? null}
              customerSites={customerSites ?? []}
            />
            {job.tags && job.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {job.tags.map((t: string) => <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PrevNextNav prevHref={prevJobHref} nextHref={nextJobHref} />
            <JobDetailClient
              job={job}
              companyId={profile!.company_id}
              profileId={user!.id}
              team={teamRes.data ?? []}
              assignees={normalizedJobAssignees}
              projectAddress={(job.customer_sites as { address: string } | null)?.address ?? null}
              sheetData={sheetData}
              gstRate={gstRate}
              pricesIncludeTax={pricesIncludeTax}
              nextInvoiceNumber={nextInvoiceNumber}
              jobTotal={estimatedSubtotal}
              quoteId={job.quote_id ?? null}
              alreadyInvoiced={alreadyInvoiced}
              existingInvoice={existingInvoice}
              actualLines={actualLines}
              actualTotal={actualTotal}
              jobStatuses={jobStatuses}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-start">
        <div className="space-y-6 min-w-0">

        <JobLockBanner jobId={id} locked={jobLocked} overridden={job.invoice_lock_override} role={profile!.role} />

        {job.description && (
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{job.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Tasks */}
        <JobTasksCard jobId={job.id} companyId={profile!.company_id} />

        {/* Materials */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Materials &amp; parts</CardTitle>
              <OrderMaterialsButton
                jobId={id}
                disabled={isFreePlan || (materialsRes.data ?? []).length === 0}
                disabledReason={isFreePlan ? 'Auto-generating purchase orders requires a paid plan' : undefined}
              />
            </div>
            {jobPurchaseOrders.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Purchase orders:{' '}
                {jobPurchaseOrders.map((po, i) => (
                  <span key={po.id}>
                    {i > 0 && ', '}
                    <Link href={`/purchase-orders/${po.id}`} className="text-orange-600 hover:underline">{po.po_number}</Link>
                    <span className="text-gray-400"> ({po.status})</span>
                  </span>
                ))}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <JobMaterials
              jobId={id}
              companyId={profile!.company_id}
              profileId={user!.id}
              materials={materialsRes.data ?? []}
              priceItems={(priceItemsRes.data ?? []) as Array<{ id: string; code: string | null; name: string; unit: string; sell_price: number; cost_price: number; type: string; quantity_on_hand: number | null }>}
              costCategories={costCategories}
              kits={kitsRes.data ?? []}
              standardMarkupEnabled={!!companySettings?.standard_markup_enabled}
              standardMarkupPct={Number(companySettings?.standard_markup_pct ?? 80)}
              canMarkupItems={canMarkupItems}
              quoteLines={quoteFillLines}
              quoteNumber={(job.quotes as { quote_number: string } | null)?.quote_number ?? null}
            />
            <SupplierInvoiceParser
              jobId={id}
              companyId={profile!.company_id}
              priceItems={(priceItemsRes.data ?? []).map(p => ({ id: p.id, name: p.name, cost_price: Number(p.cost_price) }))}
            />
          </CardContent>
        </Card>

        {/* Variations — extra work agreed after the quote. Owner/admin only, to
            match the RLS policy on the table (changing what the customer owes
            is as sensitive as invoicing). Approving one raises the job's
            invoiceable ceiling and reopens the fully-invoiced lock. */}
        {(profile!.role === 'owner' || profile!.role === 'admin') && (
          <Card>
            <CardHeader>
              <CardTitle>Variations</CardTitle>
              <p className="mt-1 text-xs text-gray-500">
                Extra work beyond the original quote. Once approved it&apos;s added to what you can invoice.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <JobVariations
                jobId={id}
                companyId={profile!.company_id}
                profileId={user!.id}
                quoteId={job.quote_id ?? null}
                variations={variations}
                gstRate={gstRate}
                pricesIncludeTax={pricesIncludeTax}
                appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
              />
            </CardContent>
          </Card>
        )}

        {/* Visits / Schedule */}
        <VisitsCard
          visits={(visitsRes.data ?? []).map(v => ({
            id: v.id,
            scheduled_start: v.scheduled_start,
            scheduled_end: v.scheduled_end,
            status: v.status,
            notes: v.notes,
            profiles: v.profiles as { full_name: string } | null,
          }))}
        />

        {/* Secondary workers */}
        <JobAssigneesCard
          jobId={job.id}
          companyId={profile!.company_id}
          assignees={normalizedJobAssignees}
          team={teamRes.data ?? []}
        />

        {/* Subcontractors — renders nothing when no invitations exist */}
        <SubcontractorStatus contractorJobId={id} companyId={profile!.company_id} />

        {/* Timesheets */}
        <Card>
          <CardHeader><CardTitle>Timesheets</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(timesheetsRes.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No time logged</p>
            ) : (
              <TimesheetTable
                timesheets={timesheetsRes.data ?? []}
                jobs={jobsForPickerRes.data ?? []}
                timezone={timezone}
                showJob={false}
              />
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader><CardTitle>Photos</CardTitle></CardHeader>
          <CardContent className="p-0 pb-2">
            <JobPhotoUpload
              jobId={id}
              companyId={profile!.company_id}
              profileId={user!.id}
              photos={(photosRes.data ?? []) as Array<{ id: string; storage_path: string; caption: string | null; created_at: string }>}
            />
          </CardContent>
        </Card>

        {/* Recurring */}
        <RecurringJobCard
          jobId={job.id}
          initial={{
            isRecurring: !!job.is_recurring,
            rule: job.recurrence_rule ?? null,
            next: job.recurrence_next ?? null,
            end: job.recurrence_end ?? null,
          }}
        />

        {/* Site forms */}
        <Card>
          <CardHeader><CardTitle>Site forms & reports</CardTitle></CardHeader>
          <CardContent className="p-0 pb-1">
            <FormFill
              jobId={id}
              companyId={profile!.company_id}
              profileId={user!.id}
              templates={(formTemplatesRes.data ?? []) as Array<{ id: string; name: string; fields: import('@/app/(dashboard)/forms/[id]/builder').FormField[] }>}
              existingSubmissions={(formSubmissionsRes.data ?? []) as Array<{ id: string; template_name: string; submitted_at: string | null; answers: Record<string, unknown> }>}
            />
          </CardContent>
        </Card>

        {/* Compliance Documents — NZ only */}
        {isNZ && <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Compliance documents</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <ComplianceDocs
              jobId={id}
              companyId={profile!.company_id}
              profileId={user!.id}
              projectAddress={(job.customer_sites as {address: string} | null)?.address ?? null}
              profileHasSignature={profileHasSignature}
              initialDocs={complianceDocs as Array<{ id: string; doc_number: string; doc_type: string; ac_form_code: string | null; project_address: string | null; status: string; created_at: string; pdf_path: string | null }>}
              pdfSignedUrls={compliancePdfUrls}
            />
          </CardContent>
        </Card>}

        {/* Messages — admin↔technician thread. Sits above Job notes: it's the
            time-sensitive one. Notes stay the durable record below. */}
        <JobMessagesCard
          jobId={id}
          profileId={user!.id}
          messages={((messagesRes.data ?? []) as unknown[]).map(m => {
            const row = m as { id: string; body: string; author_id: string | null; created_at: string; profiles: { full_name: string } | { full_name: string }[] | null }
            return {
              id: row.id,
              body: row.body,
              author_id: row.author_id,
              created_at: row.created_at,
              profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
            } satisfies JobMessage
          })}
        />

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle>Job notes</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(notesRes.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No notes</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {(notesRes.data ?? []).map(n => (
                  <li key={n.id} className="px-6 py-3">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.body}</p>
                    <p className="text-xs text-gray-400 mt-1">{(n.profiles as {full_name: string} | null)?.full_name} · {formatDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Profitability */}
        {estimatedSubtotal > 0 && (
          <ProfitabilityBadge data={{ quotedSubtotal: estimatedSubtotal, materialsCost, labourCost }} />
        )}

        {/* Job Costing */}
        <Card>
          <CardHeader><CardTitle>Job costing</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Estimated revenue</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(estimatedSubtotal)}</p>
                <p className="text-xs text-gray-400">excl. GST</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Actual labour</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(actualLabour)}</p>
                <p className="text-xs text-gray-400">billable hours</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Invoiced</p>
                <p className="text-lg font-semibold text-gray-900">{formatCurrency(totalInvoiced)}</p>
                <p className="text-xs text-gray-400">incl. GST</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-xl">
                <p className="text-xs text-[var(--accent,#f97316)] mb-1">Collected</p>
                <p className="text-lg font-semibold text-[var(--accent,#f97316)]">{formatCurrency(totalPaid)}</p>
                <p className="text-xs text-orange-400">payments received</p>
              </div>
            </div>
            {estimatedSubtotal > 0 && actualLabour > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                <span className="text-gray-500">Estimated margin (labour vs estimate)</span>
                <span className={`font-medium ${estimatedSubtotal - actualLabour >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {formatCurrency(estimatedSubtotal - actualLabour)} ({estimatedSubtotal > 0 ? Math.round(((estimatedSubtotal - actualLabour) / estimatedSubtotal) * 100) : 0}%)
                </span>
              </div>
            )}
            {materialsCostByCategory.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Material cost by category</p>
                <div className="space-y-1">
                  {materialsCostByCategory.map(c => (
                    <div key={c.name} className="flex justify-between text-sm">
                      <span className="text-gray-600">{c.name}</span>
                      <span className="font-medium text-gray-800">{formatCurrency(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progress claims */}
        <Card>
          <CardHeader><CardTitle>Progress claims</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ProgressClaims
              jobId={id}
              companyId={profile!.company_id}
              profileId={user!.id}
              jobTitle={job.title}
              customerId={job.customer_id}
              gstRate={gstRate}
              nextInvoiceNumber={nextInvoiceNumber}
              initialClaims={(claimsRes.data ?? []) as Array<{ id: string; stage_number: number; name: string; amount: number; percentage: number | null; status: 'pending' | 'invoiced' | 'paid'; invoice_id: string | null; due_date: string | null; notes: string | null }>}
              totalQuoted={estimatedSubtotal}
            />
          </CardContent>
        </Card>

        {/* Invoices */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Invoices</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(invoicesRes.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No invoices yet</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {(invoicesRes.data ?? []).map(i => (
                  <li key={i.id}>
                    <Link href={`/invoices/${i.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                      <span className="text-sm font-medium text-orange-500">{i.invoice_number}</span>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={i.status} />
                        <span className="text-sm text-gray-700">{formatCurrency(i.total)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        </div>

        {/* At-a-glance financial position — sticky so it stays visible
            alongside whichever card is currently in view. */}
        <div className="sticky top-20">
          <FinancialStatBox stats={jobFinancialStats} orientation="column" currency={currency} />
        </div>

        </div>
      </div>
    </>
  )
}
