import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PurchaseOrderActions } from './client'
import Link from 'next/link'

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('*, suppliers(name, email, phone), jobs(job_number, title), purchase_order_items(*)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()
  if (!po) notFound()

  const items = [...(po.purchase_order_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const supplier = po.suppliers as { name: string; email: string | null; phone: string | null } | null
  const job = po.jobs as { job_number: string; title: string } | null

  return (
    <>
      <Header title={po.po_number} profile={profile} />
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{po.po_number}</h2>
              <StatusBadge status={po.status} />
            </div>
            <p className="text-sm text-gray-500">
              {supplier ? <Link href={`/suppliers/${po.supplier_id}`} className="text-orange-500 hover:underline">{supplier.name}</Link> : 'No supplier'}
              {job && <> · <Link href={`/jobs/${po.job_id}`} className="text-orange-500 hover:underline">{job.job_number}</Link></>}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">Ordered {formatDate(po.order_date)}{po.expected_date && ` · Expected ${formatDate(po.expected_date)}`}</p>
          </div>
          <PurchaseOrderActions
            po={{ id: po.id, status: po.status, supplier_email: supplier?.email ?? null, supplier_phone: supplier?.phone ?? null, job_id: po.job_id }}
          />
        </div>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
                <th className="text-left px-6 py-2 font-medium">Description</th>
                <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
                <th className="text-left px-3 py-2 font-medium w-16">Unit</th>
                <th className="text-right px-3 py-2 font-medium w-28">Unit cost</th>
                <th className="text-right px-6 py-2 font-medium w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map(l => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3 text-gray-700">{l.description}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{l.quantity}</td>
                  <td className="px-3 py-3 text-gray-500">{l.unit}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(l.unit_cost)}</td>
                  <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-100">
              <tr><td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">Subtotal</td><td className="px-6 py-2 text-right text-sm font-medium text-gray-900">{formatCurrency(po.subtotal)}</td></tr>
              <tr><td colSpan={4} className="px-6 py-1 text-right text-sm text-gray-600">GST</td><td className="px-6 py-1 text-right text-sm font-medium text-gray-900">{formatCurrency(po.gst_amount)}</td></tr>
              <tr className="border-t border-gray-200"><td colSpan={4} className="px-6 py-3 text-right font-semibold text-gray-900">Total</td><td className="px-6 py-3 text-right font-bold text-gray-900 text-base">{formatCurrency(po.total)}</td></tr>
            </tfoot>
          </table>
        </Card>

        {po.notes && (
          <Card><div className="px-6 py-4 text-sm text-gray-600 whitespace-pre-wrap">{po.notes}</div></Card>
        )}
      </div>
    </>
  )
}
