// POST /api/purchase-orders/from-quote { quote_id }
//
// One-click "Order parts": takes an accepted quote's material line items, groups
// them by each item's supplier, and creates one DRAFT purchase order per supplier
// (materials with no supplier land in a single unassigned PO for the review step
// to assign). Idempotent — if POs already exist for this quote, it returns them
// instead of duplicating. The review screen then lets the user send them all.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { nextDocNumber } from '@/lib/numbering'

const bodySchema = z.object({ quote_id: z.string().uuid() })

type Line = {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  price_list_item_id: string | null
  price_list_items: { supplier_id: string | null } | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'quote_id required' }, { status: 400 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: quote } = await service
    .from('quotes')
    .select('id, company_id, converted_to_job_id, companies(default_gst_rate)')
    .eq('id', parsed.data.quote_id)
    .single()
  if (!quote || quote.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const companyId = quote.company_id
  const gstRate = (quote.companies as unknown as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15

  // Idempotent: don't regenerate if this quote already has POs.
  const { data: existing } = await service
    .from('purchase_orders').select('id').eq('quote_id', quote.id).limit(1)
  if (existing && existing.length > 0) return NextResponse.json({ ok: true, existing: true })

  const { data: rawLines } = await service
    .from('quote_line_items')
    .select('description, quantity, unit, unit_cost, price_list_item_id, price_list_items(supplier_id)')
    .eq('quote_id', quote.id)
    .eq('type', 'material')
    .order('sort_order')
  const lines = (rawLines ?? []) as unknown as Line[]
  if (lines.length === 0) return NextResponse.json({ error: 'This quote has no materials to order.' }, { status: 400 })

  // Group by supplier; null supplier -> one "unassigned" bucket (keyed '').
  const groups = new Map<string, Line[]>()
  for (const l of lines) {
    const key = l.price_list_items?.supplier_id ?? ''
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(l)
  }
  // Suppliers first, unassigned bucket last.
  const orderedKeys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0))

  // po_number base — the DB trigger (migration 20260716120000) reassigns the real
  // atomic number on insert when live; we pass distinct previews so numbering is
  // still correct if the trigger isn't yet applied.
  const base = await nextDocNumber(service, companyId, 'po')
  const m = base.match(/^(.*?)(\d+)$/)
  const prefix = m ? m[1] : base
  const start = m ? Number(m[2]) : 1
  const width = m ? m[2].length : 4

  let created = 0
  for (const key of orderedKeys) {
    const groupLines = groups.get(key)!
    const subtotal = groupLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0)
    const gst = subtotal * gstRate
    const { data: po, error: poErr } = await service.from('purchase_orders').insert({
      company_id: companyId,
      supplier_id: key || null,
      job_id: quote.converted_to_job_id,
      quote_id: quote.id,
      po_number: `${prefix}${String(start + created).padStart(width, '0')}`,
      status: 'draft',
      order_date: new Date().toISOString().slice(0, 10),
      subtotal, gst_amount: gst, total: subtotal + gst,
      created_by: user.id,
    }).select('id').single()
    if (poErr || !po) return NextResponse.json({ error: poErr?.message ?? 'Failed to create PO' }, { status: 400 })

    const { error: itemsErr } = await service.from('purchase_order_items').insert(
      groupLines.map((l, i) => ({
        purchase_order_id: po.id,
        company_id: companyId,
        price_list_item_id: l.price_list_item_id,
        description: l.description,
        quantity: Number(l.quantity),
        unit: l.unit,
        unit_cost: Number(l.unit_cost),
        line_total: Number(l.quantity) * Number(l.unit_cost),
        sort_order: i,
      }))
    )
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 400 })
    created++
  }

  return NextResponse.json({ ok: true, created })
}
