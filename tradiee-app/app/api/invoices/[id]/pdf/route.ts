// GET /api/invoices/[id]/pdf — renders the invoice PDF server-side (same layout as
// the web app's PrintInvoice/InvoicePdf) and returns a short-lived presigned R2 URL.
// Used by mobile, which has no client-side @react-pdf/renderer story, and can just
// Linking.openURL() the returned link. Must run in Node.js runtime (react-pdf).
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { InvoicePdf, type InvoicePdfData } from '@/components/pdf/invoice-pdf'
import { putObject, presignedDownload, PRIVATE_BUCKET } from '@/lib/r2'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('timezone').eq('id', auth.userId).single()

  const { data: invoice } = await service
    .from('invoices')
    .select('*, customers(name, email, billing_address), jobs(job_number, title), invoice_line_items(*), companies(name, email, phone, gst_number, logo_url, payment_instructions, invoice_footer)')
    .eq('id', id)
    .eq('company_id', auth.companyId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const co = invoice.companies as { name: string; email: string | null; phone: string | null; gst_number: string | null; logo_url: string | null; payment_instructions: string | null; invoice_footer: string | null } | null

  const data: InvoicePdfData = {
    invoice: {
      ...invoice,
      payment_instructions: co?.payment_instructions ?? null,
      invoice_footer: co?.invoice_footer ?? null,
    },
    company: {
      name: co?.name ?? '',
      email: co?.email ?? null,
      phone: co?.phone ?? null,
      gst_number: co?.gst_number ?? null,
      logo_url: co?.logo_url ?? null,
    },
    timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
  }

  const element = React.createElement(InvoicePdf, { data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = Buffer.from(await renderToBuffer(element as any))

  const key = `${auth.companyId}/invoices/${invoice.id}.pdf`
  await putObject(PRIVATE_BUCKET, key, pdfBuffer, 'application/pdf')
  const url = await presignedDownload(key, 60 * 10)

  return NextResponse.json({ url, filename: `${invoice.invoice_number}.pdf` })
}
