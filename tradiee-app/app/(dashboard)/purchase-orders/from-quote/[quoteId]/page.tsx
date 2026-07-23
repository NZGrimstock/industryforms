import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { OrderPartsReview, type PO } from '@/components/purchase-orders/order-parts-review'

// Review screen for the "Order parts" flow — shows the draft POs generated from a
// quote, one per supplier, back to back, with line items populated. User assigns
// a supplier to any unassigned PO, then sends them all.
export default async function OrderPartsPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(id)').eq('id', user.id).single()
  const companyId = profile!.company_id

  const [posRes, suppliersRes] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('id, po_number, status, supplier_id, total, suppliers(name, email), purchase_order_items(id, description, quantity, unit, unit_cost, line_total, price_list_item_id, sort_order)')
      .eq('quote_id', quoteId)
      .eq('company_id', companyId)
      .order('po_number'),
    supabase.from('suppliers').select('id, name, email').eq('company_id', companyId).order('name'),
  ])

  return (
    <>
      <Header title="Order parts" profile={profile} />
      <OrderPartsReview
        pos={(posRes.data ?? []) as unknown as PO[]}
        suppliers={suppliersRes.data ?? []}
      />
    </>
  )
}
