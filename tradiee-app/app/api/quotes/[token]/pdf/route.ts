// GET /api/quotes/[id]/pdf — renders the quote/estimate PDF server-side (same
// layout as the web app's PrintQuote/QuotePdf) and returns a short-lived
// presigned R2 URL. Used by mobile, which has no client-side
// @react-pdf/renderer story, and can just Linking.openURL() the returned
// link. Must run in Node.js runtime (react-pdf).
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { QuotePdf, type QuotePdfData } from '@/components/pdf/quote-pdf'
import { putObject, presignedDownload, PRIVATE_BUCKET } from '@/lib/r2'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { logoDataUri } from '@/lib/pdf-logo'
import { effectivePlanKey } from '@/lib/billing'

// Segment is named [token] (not [id]) only because Next.js requires every
// dynamic segment at app/api/quotes/* to share one param name, and the
// existing public accept/decline route ([token]/[action]) already claimed
// it — this route actually takes the quote's row id, not its public_token,
// same as app/api/invoices/[id]/pdf does for invoices.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: id } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('timezone').eq('id', auth.userId).single()

  const { data: quote } = await service
    .from('quotes')
    .select('*, customers(name, email, billing_address), quote_sections(sort_order, quote_line_items(*)), companies(name, email, phone, gst_number, logo_url, subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until)')
    .eq('id', id)
    .eq('company_id', auth.companyId)
    .single()

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const co = quote.companies as {
    name: string; email: string | null; phone: string | null; gst_number: string | null; logo_url: string | null
    subscription_plan: string | null; subscription_status: string | null; trial_ends_at: string | null; billing_exempt: boolean | null
    comp_plan: string | null; comp_until: string | null
  } | null

  type SectionRow = { sort_order: number; quote_line_items: { id: string; description: string; quantity: number; unit: string; unit_price: number; line_total: number; sort_order: number }[] }
  const lines = ((quote.quote_sections ?? []) as SectionRow[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap(sec => [...(sec.quote_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order))

  const data: QuotePdfData = {
    quote: {
      quote_number: quote.quote_number,
      is_estimate: quote.is_estimate,
      created_at: quote.created_at,
      expires_at: quote.expires_at,
      subtotal: quote.subtotal,
      discount_amount: quote.discount_amount,
      gst_amount: quote.gst_amount,
      total: quote.total,
      reference: quote.reference,
      customer_message: quote.customer_message,
      terms: quote.terms,
      customers: quote.customers,
      lines,
    },
    company: {
      name: co?.name ?? '',
      email: co?.email ?? null,
      phone: co?.phone ?? null,
      gst_number: co?.gst_number ?? null,
      logo_url: await logoDataUri(co?.logo_url),
      isFreePlan: effectivePlanKey(co) === 'free',
    },
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
  }

  try {
    const element = React.createElement(QuotePdf, { data })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = Buffer.from(await renderToBuffer(element as any))

    const key = `${auth.companyId}/quotes/${quote.id}.pdf`
    await putObject(PRIVATE_BUCKET, key, pdfBuffer, 'application/pdf')
    const url = await presignedDownload(key, 60 * 10)

    return NextResponse.json({ url, filename: `${quote.quote_number}.pdf` })
  } catch (e) {
    console.error('Quote PDF generation error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not generate the quote PDF.' },
      { status: 502 }
    )
  }
}
