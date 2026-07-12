import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { BillForm } from '@/components/forms/bill-form'
import { BillActions } from './client'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(default_gst_rate)').eq('id', user!.id).single()
  const companyId = profile!.company_id

  const { data: bill } = await supabase
    .from('bills')
    .select('*, suppliers(name), jobs(job_number), purchase_orders(po_number)')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()
  if (!bill) notFound()

  const [suppliersRes, jobsRes] = await Promise.all([
    supabase.from('suppliers').select('id, name').eq('company_id', companyId).order('name'),
    supabase.from('jobs').select('id, job_number, title').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
  ])
  const gstRate = (profile?.companies as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15
  const owing = Number(bill.total) - Number(bill.amount_paid)
  const po = bill.purchase_orders as { po_number: string } | null

  return (
    <>
      <Header title={bill.reference ?? 'Bill'} profile={profile} />
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={bill.status} />
            <span className="text-sm text-gray-500">{formatCurrency(bill.total)} total · {owing > 0 ? `${formatCurrency(owing)} owing` : 'fully paid'}</span>
            {po && <Link href={`/purchase-orders/${bill.purchase_order_id}`} className="text-xs text-orange-500 hover:underline">from {po.po_number}</Link>}
          </div>
          <BillActions bill={{ id: bill.id, total: Number(bill.total), amount_paid: Number(bill.amount_paid), status: bill.status }} />
        </div>

        <Card><CardContent className="py-5">
          <BillForm
            companyId={companyId}
            profileId={user!.id}
            gstRate={gstRate}
            suppliers={suppliersRes.data ?? []}
            jobs={jobsRes.data ?? []}
            bill={{
              id: bill.id, supplier_id: bill.supplier_id, job_id: bill.job_id, purchase_order_id: bill.purchase_order_id,
              reference: bill.reference, bill_date: bill.bill_date, due_date: bill.due_date, total: Number(bill.total), notes: bill.notes,
            }}
          />
        </CardContent></Card>

        {bill.due_date && <p className="text-xs text-gray-400">Due {formatDate(bill.due_date)}</p>}
      </div>
    </>
  )
}
