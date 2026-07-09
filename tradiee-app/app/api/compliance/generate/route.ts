/**
 * POST /api/compliance/generate
 * Generates a compliance document PDF, uploads to Supabase Storage,
 * inserts a compliance_documents row, and emails the PDF.
 *
 * Must run in Node.js runtime (react-pdf uses Node APIs).
 */
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateComplianceDoc, DOC_TYPE_FORM_CODES } from '@/lib/compliance/generate'
import { sendEmail } from '@/lib/email'
import { putObject, presignedDownload, PRIVATE_BUCKET } from '@/lib/r2'

const bodySchema = z.object({
  docType: z.enum(['PS1', 'PS2', 'PS3_GENERAL', 'PS3_DRAINAGE', 'PS3_PLUMBING', 'PS4', 'RBW_2A', 'RBW_6A']),
  jobId: z.string().uuid().nullish(),
  bcReference: z.string().trim().max(200).nullish(),
  clientName: z.string().trim().max(200).nullish(),
  clientEmail: z.string().trim().email().max(320).nullish().or(z.literal('')),
  projectAddress: z.string().trim().max(500).nullish(),
  territorialAuthority: z.string().trim().max(200).nullish(),
  statementData: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch profile including compliance fields
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*, companies(name, logo_url)')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const {
      docType,
      jobId,
      bcReference,
      clientName,
      clientEmail,
      projectAddress,
      territorialAuthority,
      statementData = {},
    } = parsed.data

    const serviceClient = createServiceClient()

    // Generate doc number: count all compliance docs (globally) + 1000 offset
    // This gives a unique monotonically increasing number without requiring a custom RPC
    const { count: totalDocs } = await serviceClient
      .from('compliance_documents')
      .select('id', { count: 'exact', head: true })
    const seqNum = 1000 + (totalDocs ?? 0) + 1

    const docNumber = `PS-${String(seqNum).padStart(6, '0')}`

    // Merge project address into statement_data for template consumption
    const mergedStatementData: Record<string, unknown> = {
      ...statementData,
      bc_reference: bcReference || statementData.buildingConsentNo || '',
      project_address: projectAddress || statementData.siteAddress || '',
      client_name: clientName || statementData.ownerName || '',
      client_email: clientEmail || statementData.ownerEmail || '',
    }

    const co = profile.companies as { name: string; logo_url: string | null } | null

    // Generate PDF buffer
    const pdfBuffer = await generateComplianceDoc({
      docType,
      docNumber,
      statementData: mergedStatementData,
      profile: {
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        address: null,
        lbp_number: (profile as Record<string, unknown>).lbp_number as string | null,
        cpeng_number: (profile as Record<string, unknown>).cpeng_number as string | null,
        signature_base64: (profile as Record<string, unknown>).signature_base64 as string | null,
        council: ((profile as Record<string, unknown>).council as string | null) || 'auckland',
        company_name: co?.name || null,
        logo_url: co?.logo_url || null,
        timezone: (profile as Record<string, unknown>).timezone as string | null,
      },
    })

    // Upload the PDF to the private R2 bucket
    const pdfPath = `${profile.company_id}/${docNumber}.pdf`
    try {
      await putObject(PRIVATE_BUCKET, pdfPath, pdfBuffer, 'application/pdf')
    } catch (e) {
      return NextResponse.json({ error: `Storage upload failed: ${(e as Error).message}` }, { status: 500 })
    }

    // Presigned download URL for the immediate response link (R2/S3 cap: 7 days;
    // the document detail page re-signs on demand from the stored pdf_path).
    const pdfUrl = await presignedDownload(pdfPath, 60 * 60 * 24)

    // Insert compliance_documents row
    const { data: docRow, error: insertErr } = await serviceClient
      .from('compliance_documents')
      .insert({
        company_id: profile.company_id,
        job_id: jobId || null,
        profile_id: user.id,
        doc_number: docNumber,
        doc_type: docType,
        ac_form_code: DOC_TYPE_FORM_CODES[docType],
        bc_reference: bcReference || null,
        client_name: clientName || null,
        client_email: clientEmail || null,
        project_address: projectAddress || null,
        territorial_authority: territorialAuthority || null,
        statement_data: mergedStatementData,
        pdf_path: pdfPath,
        status: 'completed',
      })
      .select('id, doc_number')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: `DB insert failed: ${insertErr.message}` }, { status: 500 })
    }

    // Send email with PDF attached
    const pdfBase64 = pdfBuffer.toString('base64')
    const recipientEmails = [profile.email]
    if (clientEmail && clientEmail !== profile.email) {
      recipientEmails.push(clientEmail)
    }

    const emailHtml = complianceEmailHtml({
      companyName: co?.name || 'Your Company',
      docNumber,
      docType,
      projectAddress: projectAddress || '',
      recipientName: clientName || profile.full_name || '',
    })

    for (const toEmail of recipientEmails) {
      await sendEmailWithAttachment({
        to: toEmail,
        subject: `Compliance Document ${docNumber} — ${docType.replace('_', ' ')}`,
        html: emailHtml,
        attachmentBase64: pdfBase64,
        attachmentName: `${docNumber}.pdf`,
      })
    }

    return NextResponse.json({
      id: docRow.id,
      docNumber: docRow.doc_number,
      pdfUrl,
    })
  } catch (err) {
    console.error('[compliance/generate]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── Email helpers ─────────────────────────────────────────────────────────────

async function sendEmailWithAttachment({
  to, subject, html, attachmentBase64, attachmentName,
}: {
  to: string
  subject: string
  html: string
  attachmentBase64: string
  attachmentName: string
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@tradehub.app'

  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — compliance email not sent')
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      attachments: [{ filename: attachmentName, content: attachmentBase64 }],
    }),
  })

  if (!res.ok) {
    const data = await res.json()
    console.warn('[compliance email]', data.message ?? 'Failed to send')
  }
}

function complianceEmailHtml({
  companyName, docNumber, docType, projectAddress, recipientName,
}: {
  companyName: string
  docNumber: string
  docType: string
  projectAddress?: string
  recipientName?: string
}) {
  const label = docType.replace(/_/g, ' ')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#1a3c5e;padding:24px 32px">
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${companyName}</p>
      <p style="margin:4px 0 0;color:#a8c4d8;font-size:13px">Compliance Document</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi${recipientName ? ` ${recipientName}` : ''},</p>
      <p style="margin:0 0 24px;color:#6b7280">Please find your compliance document attached.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Document</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1a3c5e">${docNumber}</p>
        <p style="margin:0 0 4px;color:#4b5563">${label}</p>
        ${projectAddress ? `<p style="margin:4px 0 0;font-size:13px;color:#9ca3af">${projectAddress}</p>` : ''}
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af">The PDF is attached to this email. Please retain it for your records.</p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName} · Powered by TradeHub</p>
    </div>
  </div>
</body>
</html>`
}
