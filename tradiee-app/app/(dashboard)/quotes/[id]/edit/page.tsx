import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { QuoteBuilder } from '@/components/forms/quote-builder'

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies(default_gst_rate)').eq('id', user!.id).single()

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, quote_sections(*, quote_line_items(*))')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (!quote || quote.status !== 'draft') notFound()

  const [customersRes, priceItemsRes, kitsRes] = await Promise.all([
    supabase.from('customers').select('id, name, customer_sites(id, label, address)').eq('company_id', profile!.company_id).order('name'),
    supabase.from('price_list_items').select('*').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('kits').select('*, kit_items(*, price_list_items(*))').eq('company_id', profile!.company_id).order('name'),
  ])

  const gstRate = (profile?.companies as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15

  const editQuote = {
    id: quote.id,
    title: quote.title,
    customer_id: quote.customer_id,
    site_id: quote.site_id ?? null,
    notes: quote.notes ?? null,
    customer_message: quote.customer_message ?? null,
    terms: quote.terms ?? null,
    expires_at: quote.expires_at ?? null,
    reference: quote.reference ?? null,
    discount_type: quote.discount_type ?? null,
    discount_value: quote.discount_value != null ? Number(quote.discount_value) : null,
    sections: ((quote.quote_sections ?? []) as Array<{
      title: string; is_optional: boolean; sort_order: number
      quote_line_items: Array<{
        description: string | null; quantity: number; unit: string | null
        unit_cost: number | null; unit_price: number; line_total: number
        discount_type: string | null; discount_value: number | null
        type: string; price_list_item_id: string | null; sort_order: number
      }>
    }>)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(s => ({
        title: s.title,
        is_optional: s.is_optional,
        sort_order: s.sort_order,
        lines: (s.quote_line_items ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(l => ({
            description: l.description,
            quantity: Number(l.quantity),
            unit: l.unit,
            unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
            unit_price: Number(l.unit_price),
            discount_type: l.discount_type ?? null,
            discount_value: l.discount_value != null ? Number(l.discount_value) : null,
            line_total: Number(l.line_total),
            type: l.type,
            price_list_item_id: l.price_list_item_id,
            sort_order: l.sort_order,
          })),
      })),
  }

  return (
    <>
      <Header title={`Edit ${quote.quote_number}`} profile={profile} />
      <QuoteBuilder
        companyId={profile!.company_id}
        profileId={user!.id}
        quoteNumber={quote.quote_number}
        gstRate={gstRate}
        customers={(customersRes.data ?? []) as unknown as Parameters<typeof QuoteBuilder>[0]['customers']}
        priceItems={priceItemsRes.data ?? []}
        kits={kitsRes.data ?? []}
        editQuote={editQuote}
      />
    </>
  )
}
