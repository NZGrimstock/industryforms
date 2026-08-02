// POST /api/purchase-orders/from-job { job_id }
//
// "Order materials" from a job: takes the job's materials, groups them by each
// item's supplier, and creates one DRAFT purchase order per supplier (materials
// with no supplier land in a single unassigned PO for the review step to
// assign). Each PO carries the job number as its reference and is linked via
// job_id, so the job can list its PO numbers back.
//
// Idempotent — if POs already exist for this job, it returns them rather than
// duplicating. Mirrors /api/purchase-orders/from-quote.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { nextDocNumber } from '@/lib/numbering'

const bodySchema = z.object({ job_id: z.string().uuid() })

type Material = {
  description: string
  quantity: number
  unit: string
  unit_cost: number
  price_list_item_id: string | null
  price_list_items: { supplier_id: string | null; type: string | null } | null
}

// Labour and sundries are never ordered from a supplier. The pickers now
// exclude them, but rows added before that fix (or via import) can still be
// labour, so filter defensively here too. Ad-hoc rows with no price-list link
// have no type and are treated as materials.
const NON_ORDERABLE = new Set(['labour', 'misc'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 403 })

  const { data: job } = await service
    .from('jobs')
    .select('id, company_id, job_number, companies(default_gst_rate)')
    .eq('id', parsed.data.job_id)
    .single()
  if (!job || job.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const companyId = job.company_id
  const gstRate = (job.companies as unknown as { default_gst_rate: number } | null)?.default_gst_rate ?? 0.15

  // Idempotent: don't regenerate if this job already has POs.
  const { data: existing } = await service
    .from('purchase_orders').select('id').eq('job_id', job.id).limit(1)
  if (existing && existing.length > 0) return NextResponse.json({ ok: true, existing: true })

  const { data: rawMaterials } = await service
    .from('job_materials')
    .select('description, quantity, unit, unit_cost, price_list_item_id, price_list_items(supplier_id, type)')
    .eq('job_id', job.id)
    .order('created_at')
  const materials = ((rawMaterials ?? []) as unknown as Material[])
    .filter(m => !NON_ORDERABLE.has((m.price_list_items?.type ?? '').toLowerCase()))
  if (materials.length === 0) {
    return NextResponse.json({ error: 'This job has no materials to order.' }, { status: 400 })
  }

  // Group by supplier; null supplier -> one "unassigned" bucket (keyed '').
  const groups = new Map<string, Material[]>()
  for (const m of materials) {
    const key = m.price_list_items?.supplier_id ?? ''
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(m)
  }
  // Suppliers first, unassigned bucket last.
  const orderedKeys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0))

  // po_number base — the DB trigger (migration 20260716120000) reassigns the real
  // atomic number on insert when live; distinct previews keep numbering correct
  // if the trigger isn't applied.
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
      job_id: job.id,
      reference: job.job_number,
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
