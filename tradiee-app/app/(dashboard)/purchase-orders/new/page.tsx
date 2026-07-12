import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { PurchaseOrderBuilder } from '@/components/forms/purchase-order-builder'
import { nextDocNumber } from '@/lib/numbering'

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ supplierId?: string; jobId?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(default_gst_rate)').eq('id', user!.id).single()
  const companyId = profile!.company_id

  const [suppliersRes, jobsRes, priceRes, nextNumber] = await Promise.all([
    supabase.from('suppliers').select('id, name').eq('company_id', companyId).order('name'),
    supabase.from('jobs').select('id, job_number, title').eq('company_id', companyId).not('status', 'in', '(completed,cancelled)').order('created_at', { ascending: false }).limit(100),
    supabase.from('price_list_items').select('id, name, unit, cost_price').eq('company_id', companyId).eq('is_active', true).order('name'),
    nextDocNumber(supabase, companyId, 'po'),
  ])
  const gstRate = (profile?.companies as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15

  return (
    <>
      <Header title="New Purchase Order" profile={profile} />
      <PurchaseOrderBuilder
        companyId={companyId}
        profileId={user!.id}
        poNumber={nextNumber}
        gstRate={gstRate}
        suppliers={suppliersRes.data ?? []}
        jobs={jobsRes.data ?? []}
        priceItems={priceRes.data ?? []}
        defaultSupplierId={sp.supplierId}
        defaultJobId={sp.jobId}
      />
    </>
  )
}
