import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { QuoteBuilder } from '@/components/forms/quote-builder'
import { nextDocNumber } from '@/lib/numbering'

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customerId?: string; templateId?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(default_gst_rate, prices_include_tax)').eq('id', user!.id).single()

  const [customersRes, priceItemsRes, kitsRes, companyRes, ratesRes, taxRatesRes, templateRes, nextNumber] = await Promise.all([
    supabase.from('customers').select('id, name, pricing_group_id, customer_sites(id, label, address)').eq('company_id', profile!.company_id).order('name'),
    supabase.from('price_list_items').select('*, customer_group_prices(customer_group_id, sell_price)').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('kits').select('*, kit_items(*, price_list_items(*, customer_group_prices(customer_group_id, sell_price)))').eq('company_id', profile!.company_id).order('name'),
    supabase.from('companies').select('default_terms').eq('id', profile!.company_id).single(),
    supabase.from('billing_rates').select('id, name, rate').eq('company_id', profile!.company_id).order('name'),
    supabase.from('tax_rates').select('id, name, rate').eq('company_id', profile!.company_id).eq('is_active', true).order('sort_order'),
    sp.templateId
      ? supabase.from('document_templates').select('data').eq('id', sp.templateId).eq('company_id', profile!.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    nextDocNumber(supabase, profile!.company_id, 'quote'),
  ])
  const taxRatesData = taxRatesRes.data
  const templateData = (templateRes as { data: { data: unknown } | null }).data?.data as Parameters<typeof QuoteBuilder>[0]['templateData'] | undefined
  const gstRate = (profile?.companies as {default_gst_rate: number} | null)?.default_gst_rate ?? 0.15

  return (
    <>
      <Header title="New Quote" profile={profile} />
      <QuoteBuilder
        companyId={profile!.company_id}
        profileId={user!.id}
        quoteNumber={nextNumber}
        gstRate={gstRate}
        customers={(customersRes.data ?? []) as unknown as (import('@/lib/types').Customer & { customer_sites: import('@/lib/types').CustomerSite[] })[]}
        priceItems={priceItemsRes.data ?? []}
        kits={kitsRes.data ?? []}
        defaultCustomerId={sp.customerId}
        defaultTerms={companyRes.data?.default_terms ?? undefined}
        billingRates={(ratesRes.data ?? []).map(r => ({ id: r.id, name: r.name, rate: Number(r.rate) }))}
        taxRates={(taxRatesData ?? []).map(r => ({ id: r.id, name: r.name, rate: Number(r.rate) }))}
        pricesIncludeTax={!!(profile?.companies as { prices_include_tax?: boolean } | null)?.prices_include_tax}
        templateData={templateData}
      />
    </>
  )
}
