import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

function clean(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const honeypot = clean(body.website, 200)
  if (honeypot) return NextResponse.json({ ok: true })

  const email = clean(body.email, 320).toLowerCase()
  const fullName = clean(body.fullName, 200)
  const phone = clean(body.phone, 80)
  const businessName = clean(body.businessName, 200)
  const reason = clean(body.reason, 4000)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid account email is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('id, company_id')
    .ilike('email', email)
    .maybeSingle()

  const { error } = await service.from('account_deletion_requests').insert({
    email,
    full_name: fullName || null,
    phone: phone || null,
    business_name: businessName || null,
    reason: reason || null,
    matched_profile_id: profile?.id ?? null,
    matched_company_id: profile?.company_id ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
  })

  if (error) {
    console.error('[account deletion request]', error.message)
    return NextResponse.json({ error: 'Could not submit request' }, { status: 500 })
  }

  await sendEmail({
    to: 'privacy@industryforms.co.nz',
    subject: `Account deletion request: ${email}`,
    html: `
      <p>A new account deletion request was submitted.</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Name:</strong> ${fullName || '-'}</li>
        <li><strong>Phone:</strong> ${phone || '-'}</li>
        <li><strong>Business:</strong> ${businessName || '-'}</li>
        <li><strong>Matched profile:</strong> ${profile?.id ?? '-'}</li>
        <li><strong>Matched company:</strong> ${profile?.company_id ?? '-'}</li>
      </ul>
      <p><strong>Reason/details:</strong></p>
      <p>${reason ? reason.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />') : '-'}</p>
    `,
  }).catch(err => console.warn('[account deletion email]', err))

  return NextResponse.json({ ok: true })
}
