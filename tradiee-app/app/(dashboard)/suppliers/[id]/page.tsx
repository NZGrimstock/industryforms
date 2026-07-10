import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { SupplierForm } from '@/components/forms/supplier-form'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const [{ data: supplier }, { data: pos }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('company_id', profile!.company_id)
      .single(),
    supabase
      .from('purchase_orders')
      .select('id, po_number, status, total, order_date')
      .eq('supplier_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (!supplier) notFound()

  return (
    <>
      <Header title={supplier.name} profile={profile} />
      <div className="p-6 max-w-3xl space-y-6">
        <Card>
          <CardContent className="py-5">
            <SupplierForm companyId={profile!.company_id} supplier={supplier} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Purchase orders</div>
          {!pos?.length ? (
            <p className="text-sm text-gray-400 px-6 py-4">No purchase orders for this supplier</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {pos.map(po => (
                <li key={po.id}>
                  <Link href={`/purchase-orders/${po.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                    <span className="text-sm font-medium text-orange-500">{po.po_number}</span>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={po.status} />
                      <span className="text-xs text-gray-400">{formatDate(po.order_date)}</span>
                      <span className="text-sm text-gray-700">{formatCurrency(po.total)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
