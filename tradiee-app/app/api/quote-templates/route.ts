import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Save an existing quote as a reusable template (line items + terms, no customer).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quoteId, name } = await req.json()
  if (!quoteId || !name?.trim()) return NextResponse.json({ error: 'Template name required' }, { status: 400 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { data: quote } = await service
    .from('quotes')
    .select('title, terms, company_id, quote_sections(title, is_optional, sort_order, quote_line_items(*))')
    .eq('id', quoteId)
    .eq('company_id', profile.company_id)
    .single()
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  type Sec = { title: string; is_optional: boolean; sort_order: number; quote_line_items: Array<Record<string, unknown>> }
  const sections = ((quote.quote_sections ?? []) as Sec[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({
      title: s.title,
      is_optional: s.is_optional,
      lines: [...s.quote_line_items]
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map(l => ({
          description: l.description, quantity: l.quantity, unit: l.unit, unit_cost: l.unit_cost,
          unit_price: l.unit_price, type: l.type, discount_type: l.discount_type,
          discount_value: l.discount_value, tax_rate: l.tax_rate,
        })),
    }))

  const { error } = await service.from('document_templates').insert({
    company_id: profile.company_id, kind: 'quote', name: name.trim(),
    data: { title: quote.title, terms: quote.terms, sections },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
