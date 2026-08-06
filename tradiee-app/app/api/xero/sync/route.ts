import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { refreshXeroToken, syncInvoiceToXero } from '@/lib/xero'

const bodySchema = z.object({ invoiceId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
  const { invoiceId } = parsed.data
  const service = createServiceClient()

  const { data: profile } = await service.from('profiles').select('company_id, companies!company_id(xero_tenant_id, xero_access_token, xero_refresh_token, xero_token_expires_at, default_gst_rate)').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const co = profile.companies as unknown as { xero_tenant_id: string | null; xero_access_token: string | null; xero_refresh_token: string | null; xero_token_expires_at: string | null; default_gst_rate: number | null } | null
  if (!co?.xero_tenant_id || !co.xero_refresh_token) {
    return NextResponse.json({ error: 'Xero not connected. Connect in Settings → Billing.' }, { status: 400 })
  }

  const { data: invoice } = await service
    .from('invoices')
    .select('*, customers(name, email), invoice_line_items(*)')
    .eq('id', invoiceId)
    .single()

  // Without this check, any authenticated user could pass another
  // company's invoiceId and have it synced into their OWN Xero org —
  // leaking a different tenant's customer/invoice data cross-company.
  if (!invoice || invoice.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const customer = invoice.customers as { name: string; email: string | null }

  try {
    // Refresh token if expired
    let accessToken = co.xero_access_token!
    if (!co.xero_token_expires_at || new Date(co.xero_token_expires_at) < new Date()) {
      const refreshed = await refreshXeroToken(co.xero_refresh_token)
      accessToken = refreshed.access_token
      await service.from('companies').update({
        xero_access_token: refreshed.access_token,
        xero_refresh_token: refreshed.refresh_token,
        xero_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('id', profile.company_id)
    }

    const xeroInvoiceId = await syncInvoiceToXero({
      accessToken,
      tenantId: co.xero_tenant_id,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        external_id: invoice.external_system === 'xero' ? invoice.external_id : null,
        date: invoice.invoice_date ?? invoice.created_at?.slice(0, 10),
        due_date: invoice.due_date,
        subtotal: invoice.subtotal,
        gst_amount: invoice.gst_amount,
        total: invoice.total,
        notes: invoice.notes,
        invoice_line_items: (invoice.invoice_line_items ?? []).map((l: { description: string; quantity: number; unit_price: number; line_total: number; tax_rate: number | null }) => l),
      },
      customer,
      gstRate: co.default_gst_rate ?? 0.15,
    })

    await service.from('invoices').update({
      external_system: 'xero',
      external_id: xeroInvoiceId ?? null,
      external_synced_at: new Date().toISOString(),
    }).eq('id', invoiceId)

    return NextResponse.json({ ok: true, xeroInvoiceId })
  } catch (e) {
    // A refresh token can go stale on its own (60 days unused, or the user
    // revoked access from the Xero side) and every Xero API call below can
    // fail for reasons outside our control — surface a real message instead
    // of letting this fall through as a bare unhandled 500.
    console.error('Xero sync error:', e)
    const message = e instanceof Error ? e.message : 'Xero sync failed'
    const staleAuth = message.includes('Failed to refresh Xero token')
    return NextResponse.json({
      error: staleAuth ? 'Xero connection has expired — reconnect in Settings → Billing.' : message,
    }, { status: 502 })
  }
}
