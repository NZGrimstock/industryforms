import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  let query = supabase
    .from('purchase_orders')
    .select('id, po_number, status, total, order_date, suppliers(name), jobs(job_number)')
    .eq('company_id', profile!.company_id)
  if (sp.status) query = query.eq('status', sp.status)
  const { data: pos } = await query.order('created_at', { ascending: false })

  const statuses = ['draft', 'sent', 'received', 'cancelled']

  return (
    <>
      <Header title="Purchase Orders" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex gap-1 overflow-x-auto">
            <Link href="/purchase-orders" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</Link>
            {statuses.map(s => (
              <Link key={s} href={`/purchase-orders?status=${s}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap capitalize ${sp.status === s ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</Link>
            ))}
          </div>
          <Link href="/purchase-orders/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="h-4 w-4" /> New PO
          </Link>
        </div>

        {!pos?.length ? (
          <EmptyState icon={ClipboardList} title="No purchase orders" description="Raise a purchase order to a supplier" action={
            <Link href="/purchase-orders/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus className="h-4 w-4" /> New PO
            </Link>
          } />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">PO #</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Supplier</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Job</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Total</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Ordered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pos.map(po => (
                  <tr key={po.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="p-0"><Link href={`/purchase-orders/${po.id}`} className="block px-6 py-3 font-medium text-gray-900">{po.po_number}</Link></td>
                    <td className="p-0"><Link href={`/purchase-orders/${po.id}`} className="block px-6 py-3 text-gray-700">{(po.suppliers as unknown as {name: string} | null)?.name ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/purchase-orders/${po.id}`} className="block px-6 py-3 text-gray-500">{(po.jobs as unknown as {job_number: string} | null)?.job_number ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/purchase-orders/${po.id}`} className="block px-6 py-3"><StatusBadge status={po.status} /></Link></td>
                    <td className="p-0"><Link href={`/purchase-orders/${po.id}`} className="block px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(po.total)}</Link></td>
                    <td className="p-0"><Link href={`/purchase-orders/${po.id}`} className="block px-6 py-3 text-gray-500">{formatDate(po.order_date)}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
