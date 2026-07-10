import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { portalEmailHtml } from '@/lib/customer-portal'
import { createServiceClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  email: z.string().trim().email().max(320).transform(email => email.toLowerCase()),
})

type PortalCustomer = {
  id: string
  name: string
  email: string | null
  company_id: string
  companies: { name: string; email: string | null; phone: string | null; logo_url: string | null } | { name: string; email: string | null; phone: string | null; logo_url: string | null }[] | null
}

const GENERIC_RESPONSE = {
  success: true,
  message: 'If that email matches a customer record, a portal link will be sent shortly.',
}
const PORTAL_LOGIN_COOLDOWN_MINUTES = 15
const PORTAL_LOGIN_WINDOW_MINUTES = 15
const PORTAL_LOGIN_MAX_PER_EMAIL = 5
const PORTAL_LOGIN_MAX_PER_IP = 20
const PORTAL_LOGIN_ATTEMPT_TTL_HOURS = 24

function hashThrottleValue(value: string) {
  const secret = process.env.PORTAL_RATE_LIMIT_SECRET
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? 'industryforms-portal-login'
  return createHash('sha256').update(`${secret}:${value.trim().toLowerCase()}`).digest('hex')
}

function requesterIp(req: NextRequest) {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { email } = parsed.data
  const ipHash = hashThrottleValue(requesterIp(req))
  const emailHash = hashThrottleValue(email)
  const attemptWindowSince = new Date(Date.now() - PORTAL_LOGIN_WINDOW_MINUTES * 60 * 1000).toISOString()
  const attemptTtl = new Date(Date.now() - PORTAL_LOGIN_ATTEMPT_TTL_HOURS * 60 * 60 * 1000).toISOString()

  const { data: attemptAllowed, error: attemptError } = await service
    .rpc('record_portal_login_attempt', {
      p_ip_hash: ipHash,
      p_email_hash: emailHash,
      p_window_since: attemptWindowSince,
      p_max_per_ip: PORTAL_LOGIN_MAX_PER_IP,
      p_max_per_email: PORTAL_LOGIN_MAX_PER_EMAIL,
      p_delete_before: attemptTtl,
    })
  if (attemptError) {
    console.error('[portal-login] throttle check failed', attemptError)
    return NextResponse.json(GENERIC_RESPONSE)
  }
  if (attemptAllowed !== true) {
    return NextResponse.json(GENERIC_RESPONSE)
  }

  const { data: customers, error } = await service
    .from('customers')
    .select('id, name, email, company_id, companies(name, email, phone, logo_url)')
    .ilike('email', email)
    .limit(10)

  if (error) {
    console.error('[portal-login] customer lookup failed', error)
    return NextResponse.json(GENERIC_RESPONSE)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cooldownSince = new Date(Date.now() - PORTAL_LOGIN_COOLDOWN_MINUTES * 60 * 1000).toISOString()

  for (const customer of (customers ?? []) as PortalCustomer[]) {
    if (!customer.email) continue

    const company = Array.isArray(customer.companies) ? customer.companies[0] : customer.companies
    if (!company) continue

    const { data: recentToken } = await service
      .from('customer_portal_tokens')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('email', customer.email)
      .gte('created_at', cooldownSince)
      .limit(1)
      .maybeSingle()
    if (recentToken) continue

    const { data: tokenRow, error: tokenError } = await service
      .from('customer_portal_tokens')
      .insert({
        customer_id: customer.id,
        company_id: customer.company_id,
        email: customer.email,
      })
      .select('token')
      .single()

    if (tokenError || !tokenRow) {
      console.error('[portal-login] token insert failed', tokenError)
      continue
    }

    const portalUrl = `${appUrl}/portal/${tokenRow.token}`
    const html = portalEmailHtml({
      companyName: company.name,
      customerName: customer.name,
      portalUrl,
      companyPhone: company.phone,
      companyEmail: company.email,
      logoUrl: company.logo_url,
    })

    const { error: emailError } = await sendEmail({
      to: customer.email,
      subject: `Your ${company.name} customer portal link`,
      html,
      replyTo: company.email ?? undefined,
    })

    if (emailError) {
      console.error('[portal-login] email failed', emailError)
    }
  }

  // Codex build audit marker (2026-07-07): public customer portal magic-link login.
  return NextResponse.json(GENERIC_RESPONSE)
}
