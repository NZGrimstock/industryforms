import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { PriceListClient } from './client'

export default async function PriceListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, companies!company_id(standard_markup_enabled, standard_markup_pct)').eq('id', user!.id).single()

  const [itemsRes, kitsRes, groupsRes, suppliersRes] = await Promise.all([
    supabase.from('price_list_items').select('*, customer_group_prices(customer_group_id, sell_price)').eq('company_id', profile!.company_id).order('name'),
    supabase.from('kits').select('*, kit_items(*, price_list_items(*))').eq('company_id', profile!.company_id).order('name'),
    supabase.from('customer_groups').select('id, name').eq('company_id', profile!.company_id).order('name'),
    supabase.from('suppliers').select('id, name').eq('company_id', profile!.company_id).order('name'),
  ])

  return (
    <>
      <Header title="Price List" profile={profile} />
      <PriceListClient
        companyId={profile!.company_id}
        standardMarkupEnabled={!!(profile!.companies as { standard_markup_enabled?: boolean } | null)?.standard_markup_enabled}
        standardMarkupPct={Number((profile!.companies as { standard_markup_pct?: number } | null)?.standard_markup_pct ?? 80)}
        items={itemsRes.data ?? []}
        kits={kitsRes.data ?? []}
        customerGroups={groupsRes.data ?? []}
        suppliers={suppliersRes.data ?? []}
      />
    </>
  )
}
