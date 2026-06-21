import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { QuoteBuilder } from '@/components/forms/quote-builder'
import { nextDocNumber } from '@/lib/numbering'

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies(default_gst_rate)').eq('id', user!.id).single()

  const [customersRes, priceItemsRes, kitsRes, companyRes] = await Promise.all([
    supabase.from('customers').select('id, name, customer_sites(id, label, address)').eq('company_id', profile!.company_id).order('name'),
    supabase.from('price_list_items').select('*').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('kits').select('*, kit_items(*, price_list_items(*))').eq('company_id', profile!.company_id).order('name'),
    supabase.from('companies').select('default_terms').eq('id', profile!.company_id).single(),
  ])

  const nextNumber = await nextDocNumber(supabase, profile!.company_id, 'quote')
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
      />
    </>
  )
}
