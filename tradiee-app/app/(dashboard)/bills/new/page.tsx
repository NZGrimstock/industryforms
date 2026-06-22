import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { BillForm } from '@/components/forms/bill-form'

export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ poId?: string; supplierId?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies(default_gst_rate)').eq('id', user!.id).single()
  const companyId = profile!.company_id

  const [suppliersRes, jobsRes] = await Promise.all([
    supabase.from('suppliers').select('id, name').eq('company_id', companyId).order('name'),
    supabase.from('jobs').select('id, job_number, title').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
  ])

  // Optional prefill from a received purchase order, or just from a supplier
  let defaults: { supplier_id?: string; job_id?: string; purchase_order_id?: string; total?: number } | undefined
  if (sp.poId) {
    const { data: po } = await supabase.from('purchase_orders').select('id, supplier_id, job_id, total').eq('id', sp.poId).eq('company_id', companyId).single()
    if (po) defaults = { supplier_id: po.supplier_id ?? undefined, job_id: po.job_id ?? undefined, purchase_order_id: po.id, total: Number(po.total) }
  } else if (sp.supplierId) {
    defaults = { supplier_id: sp.supplierId }
  }

  const gstRate = (profile?.companies as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15

  return (
    <>
      <Header title="Record bill" profile={profile} />
      <div className="p-6 max-w-2xl">
        <Card><CardContent className="py-5">
          <BillForm companyId={companyId} profileId={user!.id} gstRate={gstRate} suppliers={suppliersRes.data ?? []} jobs={jobsRes.data ?? []} defaults={defaults} />
        </CardContent></Card>
      </div>
    </>
  )
}
