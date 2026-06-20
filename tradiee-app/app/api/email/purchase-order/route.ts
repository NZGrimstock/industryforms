import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { formatCurrency } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { poId } = await req.json()
  const service = createServiceClient()

  const { data: po } = await service
    .from('purchase_orders')
    .select('po_number, total, notes, expected_date, suppliers(name, email), companies(name, email, phone), purchase_order_items(description, quantity, unit, unit_cost, line_total, sort_order)')
    .eq('id', poId)
    .single()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  const supplier = po.suppliers as unknown as { name: string; email: string | null } | null
  if (!supplier?.email) return NextResponse.json({ error: 'Supplier has no email address' }, { status: 400 })
  const company = po.companies as unknown as { name: string; email: string | null; phone: string | null } | null

  const items = [...((po.purchase_order_items ?? []) as Array<{ description: string; quantity: number; unit: string; unit_cost: number; line_total: number; sort_order: number }>)].sort((a, b) => a.sort_order - b.sort_order)
  const rows = items.map(l => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${l.description}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${l.quantity} ${l.unit}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(l.unit_cost)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(l.line_total)}</td></tr>`).join('')

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111">
      <h2 style="margin-bottom:4px">Purchase Order ${po.po_number}</h2>
      <p style="color:#666;margin-top:0">From ${company?.name ?? ''}${po.expected_date ? ` · Expected delivery: ${po.expected_date}` : ''}</p>
      <p>Hi ${supplier.name},</p>
      <p>Please supply the following:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
        <thead><tr style="background:#f7f7f7"><th style="padding:6px 10px;text-align:left">Item</th><th style="padding:6px 10px;text-align:right">Qty</th><th style="padding:6px 10px;text-align:right">Unit</th><th style="padding:6px 10px;text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:right;font-weight:bold">Total (incl. GST): ${formatCurrency(po.total)}</p>
      ${po.notes ? `<p style="color:#444"><strong>Notes:</strong> ${po.notes}</p>` : ''}
      <p style="color:#666;font-size:13px">${company?.name ?? ''}${company?.phone ? ` · ${company.phone}` : ''}</p>
    </div>`

  const result = await sendEmail({ to: supplier.email, subject: `Purchase Order ${po.po_number} from ${company?.name ?? ''}`, html, replyTo: company?.email ?? undefined })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await service.from('purchase_orders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', poId).eq('status', 'draft')
  return NextResponse.json({ ok: true })
}
