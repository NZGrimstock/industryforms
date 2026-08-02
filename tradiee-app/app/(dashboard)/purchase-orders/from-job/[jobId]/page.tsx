import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { OrderMaterialsWizard, type WizardPO } from '@/components/purchase-orders/order-materials-wizard'

// Steps through the draft POs generated from a job's materials, one per
// supplier, opening them one after the other to be completed and sent.
export default async function OrderMaterialsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const companyId = profile!.company_id

  const [jobRes, posRes, suppliersRes] = await Promise.all([
    supabase.from('jobs').select('id, job_number').eq('id', jobId).eq('company_id', companyId).single(),
    supabase
      .from('purchase_orders')
      .select('id, po_number, supplier_id, total, reference, suppliers(name, email), purchase_order_items(id, description, quantity, unit, line_total, price_list_item_id, sort_order)')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .order('po_number'),
    supabase.from('suppliers').select('id, name, email').eq('company_id', companyId).order('name'),
  ])
  if (!jobRes.data) notFound()

  return (
    <>
      <Header title="Order materials" profile={profile} />
      <OrderMaterialsWizard
        pos={(posRes.data ?? []) as unknown as WizardPO[]}
        suppliers={suppliersRes.data ?? []}
        jobId={jobId}
        jobNumber={jobRes.data.job_number}
      />
    </>
  )
}
