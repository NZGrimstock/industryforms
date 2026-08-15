// POST /api/xero/sync-credit-note { creditNoteId } — manual sync, mirrors
// /api/xero/sync for invoices exactly (same auth shape, same token-refresh
// handling, same error framing). Separate route rather than branching the
// existing one on document type: the two payloads (invoice line items vs a
// single credit-note line) don't share enough shape to make branching
// clearer than two small routes.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { refreshXeroToken, syncCreditNoteToXero } from '@/lib/xero'

const bodySchema = z.object({ creditNoteId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'creditNoteId required' }, { status: 400 })
  const { creditNoteId } = parsed.data
  const service = createServiceClient()

  const { data: profile } = await service.from('profiles').select('company_id, role, companies!company_id(xero_tenant_id, xero_access_token, xero_refresh_token, xero_token_expires_at, default_gst_rate)').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only an owner or admin can sync to Xero.' }, { status: 403 })
  }

  const co = profile.companies as unknown as { xero_tenant_id: string | null; xero_access_token: string | null; xero_refresh_token: string | null; xero_token_expires_at: string | null; default_gst_rate: number | null } | null
  if (!co?.xero_tenant_id || !co.xero_refresh_token) {
    return NextResponse.json({ error: 'Xero not connected. Connect in Settings → Billing.' }, { status: 400 })
  }

  const { data: creditNote } = await service
    .from('credit_notes')
    .select('*, customers(name, email), invoices!source_invoice_id(invoice_number)')
    .eq('id', creditNoteId)
    .single()
  if (!creditNote || creditNote.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Credit note not found' }, { status: 404 })
  }

  const customer = creditNote.customers as { name: string; email: string | null }
  const sourceInvoice = creditNote.invoices as { invoice_number: string } | null

  try {
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

    const xeroCreditNoteId = await syncCreditNoteToXero({
      accessToken,
      tenantId: co.xero_tenant_id,
      creditNote: {
        id: creditNote.id,
        credit_note_number: creditNote.credit_note_number,
        external_id: creditNote.external_system === 'xero' ? creditNote.external_id : null,
        date: creditNote.created_at?.slice(0, 10) ?? null,
        amount: creditNote.amount,
        source_invoice_number: sourceInvoice?.invoice_number ?? '',
        reason: creditNote.reason,
      },
      customer,
      gstRate: co.default_gst_rate ?? 0.15,
    })

    await service.from('credit_notes').update({
      external_system: 'xero',
      external_id: xeroCreditNoteId ?? null,
      external_synced_at: new Date().toISOString(),
    }).eq('id', creditNoteId)

    return NextResponse.json({ ok: true, xeroCreditNoteId })
  } catch (e) {
    console.error('Xero credit-note sync error:', e)
    const message = e instanceof Error ? e.message : 'Xero sync failed'
    const staleAuth = message.includes('Failed to refresh Xero token')
    return NextResponse.json({
      error: staleAuth ? 'Xero connection has expired — reconnect in Settings → Billing.' : message,
    }, { status: 502 })
  }
}
