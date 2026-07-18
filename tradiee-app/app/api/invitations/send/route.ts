import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { DEFAULT_TIMEZONE, formatDate } from '@/lib/datetime'

const bodySchema = z.object({
  jobId: z.string().uuid(),
  subcontractorEmail: z.string().trim().email().max(320),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullish(),
  projectAddress: z.string().trim().max(500).nullish(),
  dueDate: z.string().nullish(),
  agreedPrice: z.number().nonnegative().nullish(),
})

type PushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, string>
}

async function sendExpoPush(messages: PushMessage[]) {
  if (!messages.length) return
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { jobId, subcontractorEmail, title, description, projectAddress, dueDate, agreedPrice } = parsed.data

  // 1. Get authed user's company_id and company name
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, companies!company_id(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const contractorCompanyId = profile.company_id
  const contractorCompanyName = (profile.companies as unknown as { name: string } | null)?.name ?? 'A contractor'

  // 2. Check if subcontractorEmail matches an active platform user
  const { data: subProfile } = await supabase
    .from('profiles')
    .select('company_id, timezone')
    .eq('email', subcontractorEmail)
    .eq('is_active', true)
    .maybeSingle()

  const subcontractorCompanyId = subProfile?.company_id ?? null
  const subcontractorTimezone = subProfile?.timezone ?? DEFAULT_TIMEZONE
  const onPlatform = subcontractorCompanyId !== null

  // 3. Insert invitation
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const serviceClient = createServiceClient()
  const { data: invitation, error: invError } = await serviceClient
    .from('job_invitations')
    .insert({
      job_id: jobId,
      contractor_company_id: contractorCompanyId,
      invited_by: user.id,
      subcontractor_email: subcontractorEmail,
      subcontractor_company_id: subcontractorCompanyId,
      title,
      description: description ?? null,
      project_address: projectAddress ?? null,
      due_date: dueDate ?? null,
      agreed_price: agreedPrice ?? null,
      status: 'pending',
      token,
    })
    .select('id, token')
    .single()

  if (invError || !invitation) {
    console.error('[invitations/send]', invError?.message)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webUrl = `${appUrl}/invite/${token}`

  // 4. If on platform: send push notification to subcontractor's company
  if (onPlatform && subcontractorCompanyId) {
    const { data: subProfiles } = await serviceClient
      .from('profiles')
      .select('expo_push_token')
      .eq('company_id', subcontractorCompanyId)
      .eq('is_active', true)
      .not('expo_push_token', 'is', null)

    const messages: PushMessage[] = (subProfiles ?? [])
      .filter((p): p is { expo_push_token: string } => typeof p.expo_push_token === 'string')
      .map(p => ({
        to: p.expo_push_token,
        title: 'Job invitation',
        body: `${contractorCompanyName} invited you to: ${title}`,
        data: { screen: 'invitation', token: invitation.token },
      }))

    await sendExpoPush(messages)
  }

  // 5. Send email
  let emailHtml: string
  if (onPlatform) {
    const deepLink = `industryforms://invite/${token}`
    emailHtml = invitationEmailHtml({
      contractorCompanyName,
      jobTitle: title,
      description: description ?? null,
      projectAddress: projectAddress ?? null,
      dueDate: dueDate ?? null,
      agreedPrice: agreedPrice ?? null,
      deepLink,
      webUrl,
      onPlatform: true,
      timezone: subcontractorTimezone,
    })
  } else {
    emailHtml = invitationEmailHtml({
      contractorCompanyName,
      jobTitle: title,
      description: description ?? null,
      projectAddress: projectAddress ?? null,
      dueDate: dueDate ?? null,
      agreedPrice: agreedPrice ?? null,
      deepLink: null,
      webUrl,
      onPlatform: false,
      timezone: DEFAULT_TIMEZONE,
    })
  }

  await sendEmail({
    to: subcontractorEmail,
    subject: `Job invitation from ${contractorCompanyName}`,
    html: emailHtml,
  })

  return NextResponse.json({ id: invitation.id, token: invitation.token, onPlatform })
}

function invitationEmailHtml({
  contractorCompanyName,
  jobTitle,
  description,
  projectAddress,
  dueDate,
  agreedPrice,
  deepLink,
  webUrl,
  onPlatform,
  timezone,
}: {
  contractorCompanyName: string
  jobTitle: string
  description: string | null
  projectAddress: string | null
  dueDate: string | null
  agreedPrice: number | null
  deepLink: string | null
  webUrl: string
  onPlatform: boolean
  timezone: string
}) {
  const dueDateStr = dueDate
    ? formatDate(dueDate, timezone, { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const priceStr = agreedPrice != null
    ? new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(agreedPrice)
    : null

  const ctaSection = onPlatform && deepLink
    ? `<a href="${deepLink}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;margin-right:12px">Open in IndustryForms →</a>
       <a href="${webUrl}" style="display:inline-block;background:#ffffff;color:#374151;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;border:1px solid #d1d5db">View in browser</a>`
    : `<a href="${webUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">View job invitation →</a>
       <p style="margin:20px 0 0;font-size:13px;color:#6b7280">Don't have an account? <a href="${webUrl}" style="color:#f97316">Sign up to IndustryForms</a> to import this job directly and manage it digitally.</p>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb">
      <p style="margin:0;color:#111827;font-size:20px;font-weight:700">${contractorCompanyName}</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 8px;font-size:16px;color:#374151">You have a new job invitation</p>
      <p style="margin:0 0 24px;font-size:13px;color:#6b7280">${contractorCompanyName} has invited you to take on a job.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Job</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827">${jobTitle}</p>
        ${description ? `<p style="margin:0 0 12px;font-size:14px;color:#4b5563">${description}</p>` : ''}
        ${projectAddress ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280">📍 ${projectAddress}</p>` : ''}
        ${dueDateStr ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280">📅 Due: ${dueDateStr}</p>` : ''}
        ${priceStr ? `<p style="margin:0;font-size:15px;font-weight:600;color:#059669">Agreed price: ${priceStr}</p>` : ''}
      </div>
      ${ctaSection}
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${contractorCompanyName} via IndustryForms</p>
    </div>
  </div>
</body>
</html>`
}
