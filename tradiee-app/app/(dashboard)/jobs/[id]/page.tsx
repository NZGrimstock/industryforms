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
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils'
import { JobDetailClient } from './client'
import { JobMaterials } from './materials'
import { PrintJobSheet } from '@/components/pdf/print-job-sheet'
import { JobPhotoUpload } from '@/components/ui/photo-upload'
import { ProfitabilityBadge } from '@/components/ui/profitability-badge'
import { SupplierInvoiceParser } from '@/components/ui/supplier-invoice-parser'
import { FormFill } from '@/components/ui/form-fill'
import { ProgressClaims } from '@/components/ui/progress-claims'
import { ComplianceDocs } from '@/components/compliance/ComplianceDocs'
import { InviteSubcontractorModal } from '@/components/jobs/InviteSubcontractorModal'
import { SubcontractorStatus } from '@/components/jobs/SubcontractorStatus'
import Link from 'next/link'
import { MapPin } from 'lucide-react'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies(name, phone, email, address, gst_number, default_gst_rate, logo_url, country)').eq('id', user!.id).single()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*, customers(name, email, phone), customer_sites!site_id(address), profiles!assigned_to(full_name), quotes!quote_id(quote_number)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (jobError) console.error('[job detail]', jobError.message)

  if (!job) notFound()

  const [visitsRes, notesRes, timesheetsRes, invoicesRes, teamRes, materialsRes, priceItemsRes, photosRes, formTemplatesRes, formSubmissionsRes, claimsRes, complianceDocsRes] = await Promise.all([
    supabase.from('job_visits').select('*, profiles(full_name)').eq('job_id', id).order('scheduled_start'),
    supabase.from('job_notes').select('*, profiles(full_name)').eq('job_id', id).order('created_at', { ascending: false }),
    supabase.from('timesheets').select('*, profiles(full_name)').eq('job_id', id).order('started_at', { ascending: false }),
    supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, subtotal').eq('job_id', id),
    supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true),
    supabase.from('job_materials').select('*').eq('job_id', id).order('created_at'),
    supabase.from('price_list_items').select('id, name, unit, sell_price, cost_price, type').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('job_photos').select('id, storage_path, caption, created_at').eq('job_id', id).order('created_at'),
    supabase.from('form_templates').select('id, name, fields').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('form_submissions').select('id, template_name, submitted_at, answers').eq('job_id', id).order('created_at'),
    supabase.from('progress_claims').select('*').eq('job_id', id).order('stage_number'),
    supabase.from('compliance_documents').select('id, doc_number, doc_type, ac_form_code, project_address, status, created_at, pdf_path').eq('job_id', id).order('created_at', { ascending: false }),
  ])

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

  const profileHasSignature = !!((profile as Record<string, unknown>).signature_base64)

  const gstRate = (profile?.companies as {default_gst_rate: number} | null)?.default_gst_rate ?? 0.15
  const nextInvoiceNumber = await nextDocNumber(supabase, profile!.company_id, 'invoice')

  // Job costing: estimated from quote, actual from timesheets + invoices
  let estimatedSubtotal = 0
  let quoteLineItems: Array<{ description: string; quantity: number; unit: string; unit_price: number }> = []
  let quoteFillLines: Array<{ description: string; quantity: number; unit: string; unit_cost: number; unit_price: number; type: string; price_list_item_id: string | null }> = []
  if (job.quote_id) {
    const { data: qLines } = await supabase
      .from('quote_line_items')
      .select('quantity, unit_price, unit_cost, description, unit, type, price_list_item_id, sort_order')
      .eq('quote_id', job.quote_id)
      .order('sort_order')
    quoteLineItems = (qLines ?? []).map(l => ({
      description: l.description ?? '',
      quantity: Number(l.quantity),
      unit: l.unit ?? 'each',
      unit_price: Number(l.unit_price),
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
    estimatedSubtotal = quoteLineItems.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
  }
  const actualLabour = (timesheetsRes.data ?? []).reduce((sum, t) => {
    if (!t.is_billable || !t.bill_rate || !t.ended_at) return sum
    const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000
    return sum + hrs * Number(t.bill_rate)
  }, 0)

  const materialsCost = (materialsRes.data ?? []).reduce((sum, m) => sum + Number(m.quantity) * Number(m.unit_cost ?? 0), 0)
  const labourCost = (timesheetsRes.data ?? []).reduce((sum, t) => {
    if (!t.ended_at) return sum
    const hrs = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000
    return sum + hrs * Number(t.cost_rate ?? t.bill_rate ?? 0)
  }, 0)
  const totalPaid = (invoicesRes.data ?? []).reduce((sum, i) => sum + Number(i.amount_paid ?? 0), 0)
  const totalInvoiced = (invoicesRes.data ?? []).reduce((sum, i) => sum + Number(i.total ?? 0), 0)
  // Sum of invoiced value excl. GST (excluding voided invoices) — used to prevent over-invoicing
  const alreadyInvoiced = (invoicesRes.data ?? [])
    .filter(i => i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.subtotal ?? 0), 0)

  // Actual line items for "invoice from actuals" (logged materials + billable labour)
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
  const actualTotal = actualLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)

  const co = profile?.companies as { name: string; phone: string | null; email: string | null; address: string | null; logo_url: string | null; gst_number: string | null; default_gst_rate: number; country: string } | null
  const isNZ = (co?.country ?? 'NZ') === 'NZ'
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
    },
  }

  return (
    <>
      <Header title={`${job.job_number} — ${job.title}`} profile={profile} />
      <div className="p-6 space-y-6 max-w-5xl">
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
              {job.quotes && <> · From quote <Link href={`/quotes/${job.quote_id}`} className="text-orange-500 hover:underline">{(job.quotes as {quote_number: string}).quote_number}</Link></>}
            </p>
            {job.customer_sites && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="h-3.5 w-3.5" />
                {(job.customer_sites as {address: string}).address}
              </p>
            )}
            {job.tags && job.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {job.tags.map((t: string) => <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PrintJobSheet data={sheetData} />
            <InviteSubcontractorModal
              jobId={id}
              jobTitle={job.title}
              projectAddress={(job.customer_sites as { address: string } | null)?.address ?? null}
            />
            <JobDetailClient
              job={job}
              companyId={profile!.company_id}
              profileId={user!.id}
              team={teamRes.data ?? []}
              gstRate={gstRate}
              nextInvoiceNumber={nextInvoiceNumber}
              jobTotal={estimatedSubtotal}
              quoteId={job.quote_id ?? null}
              alreadyInvoiced={alreadyInvoiced}
              actualLines={actualLines}
              actualTotal={actualTotal}
              jobStatuses={await getJobStatuses(supabase, profile!.company_id)}
            />
          </div>
        </div>

        {job.description && (
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{job.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Tasks */}
        <JobTasksCard jobId={job.id} companyId={profile!.company_id} />

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

        {/* Visits / Schedule */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Scheduled visits</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(visitsRes.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No visits scheduled yet</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {(visitsRes.data ?? []).map(v => (
                  <li key={v.id} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{formatDateTime(v.scheduled_start)}</p>
                      <p className="text-xs text-gray-400">to {formatDateTime(v.scheduled_end)} · {(v.profiles as {full_name: string} | null)?.full_name ?? 'Unassigned'}</p>
                      {v.notes && <p className="text-xs text-gray-500 mt-0.5">{v.notes}</p>}
                    </div>
                    <StatusBadge status={v.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Subcontractors — renders nothing when no invitations exist */}
        <SubcontractorStatus contractorJobId={id} companyId={profile!.company_id} />

        {/* Timesheets */}
        <Card>
          <CardHeader><CardTitle>Timesheets</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(timesheetsRes.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No time logged</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
                    <th className="text-left px-6 py-2 font-medium">Who</th>
                    <th className="text-left px-6 py-2 font-medium">Start</th>
                    <th className="text-left px-6 py-2 font-medium">End</th>
                    <th className="text-right px-6 py-2 font-medium">Rate</th>
                    <th className="text-left px-6 py-2 font-medium">Billable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(timesheetsRes.data ?? []).map(t => (
                    <tr key={t.id}>
                      <td className="px-6 py-2.5 text-gray-700">{(t.profiles as {full_name: string} | null)?.full_name ?? '—'}</td>
                      <td className="px-6 py-2.5 text-gray-500">{formatDateTime(t.started_at)}</td>
                      <td className="px-6 py-2.5 text-gray-500">{t.ended_at ? formatDateTime(t.ended_at) : <span className="text-yellow-500">Running</span>}</td>
                      <td className="px-6 py-2.5 text-right text-gray-600">{t.bill_rate ? `${formatCurrency(t.bill_rate)}/hr` : '—'}</td>
                      <td className="px-6 py-2.5">{t.is_billable ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Materials */}
        <Card>
          <CardHeader><CardTitle>Materials & parts</CardTitle></CardHeader>
          <CardContent className="p-0">
            <JobMaterials
              jobId={id}
              companyId={profile!.company_id}
              profileId={user!.id}
              materials={materialsRes.data ?? []}
              priceItems={(priceItemsRes.data ?? []) as Array<{ id: string; name: string; unit: string; sell_price: number; cost_price: number; type: string }>}
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
    </>
  )
}
