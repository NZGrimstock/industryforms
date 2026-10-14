import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { StatusBadge } from '@/components/ui/badge'
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { paperCompany } from '@/lib/paper-company'
import { PaperDateInput } from '@/components/documents/paper-date-input'
import { PoPaperEditor, type PoItem } from './po-paper-editor'
import {
  DocumentWorkspace, Paper, PaperHeader, PaperFields, PaperColumns, PaperBlock, PaperSignatures,
  PaperLegend, InternalRail, RailCard, RailRow,
} from '@/components/documents/paper'
import { PurchaseOrderActions } from './client'
import Link from 'next/link'
import { redirectIfFreePlan } from '@/lib/billing-guards'
import type { BillingCompany } from '@/lib/billing'

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, companies!company_id(name, email, phone, gst_number, logo_url, default_gst_rate, subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until)').eq('id', user!.id).single()
  redirectIfFreePlan(profile?.companies as unknown as BillingCompany | null)

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('*, suppliers(name, email, phone, address), jobs(job_number, title, customer_sites!site_id(address)), purchase_order_items(*)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()
  if (!po) notFound()

  const items = [...(po.purchase_order_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const supplier = po.suppliers as { name: string; email: string | null; phone: string | null; address: string | null } | null
  const job = po.jobs as { job_number: string; title: string; customer_sites: { address: string } | null } | null
  const isDraft = po.status === 'draft'
  const gstRate = (profile?.companies as { default_gst_rate?: number } | null)?.default_gst_rate ?? 0.15
  const steps = [
    { label: 'Draft', done: true },
    { label: po.status === 'cancelled' ? 'Cancelled' : 'Sent to supplier', done: po.status !== 'draft' },
    { label: 'Received — stock updated', done: po.status === 'received' },
  ]

  return (
    <>
      <Header title={po.po_number} profile={profile} />
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-[1240px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">
              <Link href="/purchase-orders" className="hover:underline">Purchase orders</Link> / <b className="font-semibold text-gray-900">{po.po_number}</b>
            </span>
            <StatusBadge status={po.status} />
            <span className="flex-1" />
            <PurchaseOrderActions
              po={{ id: po.id, po_number: po.po_number, status: po.status, supplier_email: supplier?.email ?? null, supplier_phone: supplier?.phone ?? null, job_id: po.job_id, company_id: po.company_id }}
              supplierName={supplier?.name ?? 'the supplier'}
              stockLines={items.filter(i => i.price_list_item_id).map(i => ({ item_id: i.price_list_item_id as string, quantity: Number(i.quantity) }))}
            />
          </div>
          <PaperLegend who="supplier" />

          <DocumentWorkspace>
            <Paper label={`Purchase order ${po.po_number}`}>
              <PaperHeader company={paperCompany(profile?.companies)} docLabel="Purchase order" docNumber={po.po_number} />
              <PaperFields
                fields={[
                  { label: 'Order date', value: formatDate(po.order_date) },
                  { label: 'PO No.', value: po.po_number },
                  { label: 'Expected delivery', value: <PaperDateInput table="purchase_orders" id={po.id} column="expected_date" value={po.expected_date} editable={isDraft} label="Expected delivery" /> },
                ]}
              />
              <PaperColumns>
                <PaperBlock title="Supplier">
                  {supplier ? (
                    <>
                      <Link href={`/suppliers/${po.supplier_id}`} className="hover:underline">{supplier.name}</Link>
                      {supplier.address ? <div className="whitespace-pre-wrap">{supplier.address}</div> : null}
                      {supplier.email ? <div>{supplier.email}</div> : null}
                      {supplier.phone ? <div>{supplier.phone}</div> : null}
                    </>
                  ) : 'No supplier'}
                </PaperBlock>
                <PaperBlock title="Deliver to">
                  {job?.customer_sites?.address ? <div className="whitespace-pre-wrap">{job.customer_sites.address}</div> : null}
                  {job ? <div>Job ref: <Link href={`/jobs/${po.job_id}`} className="hover:underline">{job.job_number}</Link> — {job.title}</div> : null}
                </PaperBlock>
              </PaperColumns>

              <PoPaperEditor
                poId={po.id}
                companyId={po.company_id}
                gstRate={gstRate}
                initialItems={items as PoItem[]}
                initialNotes={po.notes}
                editable={isDraft}
                stored={{ subtotal: Number(po.subtotal), gst: Number(po.gst_amount), total: Number(po.total) }}
              />

              <PaperSignatures left="Authorised by" right="Received by" />
            </Paper>

            <InternalRail label="Internal — not on the purchase order">
              <RailCard title="Progress">
                <ol className="space-y-2">
                  {steps.map(st => (
                    <li key={st.label} className={cn('flex items-center gap-2.5 text-sm', st.done ? 'font-semibold text-gray-900' : 'text-gray-600')}>
                      <span aria-hidden="true" className={cn('h-5 w-5 shrink-0 rounded-full border-2', st.done ? 'border-orange-700 bg-orange-700' : 'border-gray-300')} />
                      {st.label}
                    </li>
                  ))}
                </ol>
                {po.sent_at && <div className="mt-2"><RailRow label="Sent" value={formatDateTime(po.sent_at)} /></div>}
                {po.received_at && <RailRow label="Received" value={formatDateTime(po.received_at)} />}
              </RailCard>
              {job && (
                <RailCard title="Charged to job">
                  <Link href={`/jobs/${po.job_id}`} className="text-sm font-medium text-orange-700 hover:underline">{job.job_number} {job.title}</Link>
                  <RailRow label="This PO (ex GST)" value={formatCurrency(po.subtotal)} />
                </RailCard>
              )}
              {isDraft && (
                <RailCard>
                  <p className="text-[13px] leading-normal text-gray-600">This PO is a draft. Change anything on the page, and each line saves when you leave it. Once it&apos;s sent, the page is locked as the record.</p>
                </RailCard>
              )}
            </InternalRail>
          </DocumentWorkspace>
        </div>
      </div>
    </>
  )
}
