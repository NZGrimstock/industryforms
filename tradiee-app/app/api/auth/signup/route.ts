import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isPasswordValid, PASSWORD_POLICY_MESSAGE } from '@/lib/password'
import { DEFAULT_JOB_STATUSES } from '@/lib/job-statuses'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

// Tells the business admin console (admin.industryforms.co.nz) about a new trial signup
// so sales/support can see and follow up with them well before day 28, when Stripe would
// otherwise be the first and only signal. Never allowed to fail the signup itself — the
// caller fires this without awaiting and swallows any error.
async function notifyAdminConsole(input: { fullName: string; email: string; phone?: string; companyName: string }) {
  const url = process.env.ADMIN_CONSOLE_URL
  const ingestKey = process.env.ADMIN_CONSOLE_INGEST_KEY
  if (!url || !ingestKey) return // not configured (e.g. local dev) — skip silently

  const response = await fetch(`${url.replace(/\/$/, '')}/api/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ingestKey,
      name: input.fullName,
      email: input.email,
      phone: input.phone || undefined,
      company: input.companyName,
      source: 'Trial signup',
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`admin console responded ${response.status}`)
}

// 8-char base36 code — collision-checked at insert time (retried on conflict),
// not because collisions are likely, but because it's cheap insurance.
function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

function emailDomain(addr: string | null | undefined): string | null {
  return addr?.split('@')[1]?.toLowerCase() ?? null
}

export async function POST(request: Request) {
  try {
    const { fullName, email, password, companyName, companyAddress, tradeType, country, phone, acceptedTerms, referralCode } = await request.json()

    if (!fullName || !email || !password || !companyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Phone is required: it's the only channel support/sales can reach a trial
    // on, and both signup forms already ask for it.
    if (!phone?.trim()) {
      return NextResponse.json({ error: 'A phone number is required' }, { status: 400 })
    }
    if (!acceptedTerms) {
      return NextResponse.json({ error: 'You must accept the Terms of Service' }, { status: 400 })
    }
    if (!isPasswordValid(password)) {
      return NextResponse.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 })
    }

    const supabase = createServiceClient()

    async function rollbackSignup(userId: string, companyId?: string) {
      if (companyId) await supabase.from('companies').delete().eq('id', companyId)
      await supabase.auth.admin.deleteUser(userId)
    }

    // Create the auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    const userId = authData.user.id
    const gstRate = country === 'AU' ? 0.10 : 0.15
    const trialEndsAt = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString()

    // Referral attribution — optional, never blocks signup. An invalid code
    // or a self-referral attempt (same email domain as the referrer) just
    // silently skips attribution rather than erroring the whole signup.
    let referredByCompanyId: string | null = null
    if (referralCode) {
      const { data: referrer } = await supabase
        .from('companies')
        .select('id, email')
        .eq('referral_code', String(referralCode).trim().toUpperCase())
        .maybeSingle()
      if (referrer && emailDomain(referrer.email) !== emailDomain(email)) {
        referredByCompanyId = referrer.id
      }
    }

    // Create company. Every company gets its own referral_code to share —
    // collision odds are astronomical (36^8) but the retry is cheap insurance.
    let company: { id: string } | null = null
    let companyError: { message: string } | null = null
    for (let attempt = 0; attempt < 3 && !company; attempt++) {
      const result = await supabase
        .from('companies')
        .insert({
          name: companyName,
          trade_type: tradeType || null,
          country,
          phone: phone.trim(),
          address: companyAddress || null,
          default_gst_rate: gstRate,
          subscription_plan: 'trial',
          subscription_status: 'trialing',
          trial_ends_at: trialEndsAt,
          referral_code: generateReferralCode(),
          referred_by_company_id: referredByCompanyId,
        })
        .select()
        .single()
      if (result.data) { company = result.data; break }
      companyError = result.error
      if (!result.error?.message.includes('referral_code')) break // not a code collision — don't retry
    }
    if (!company) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: companyError?.message ?? 'Could not create company' }, { status: 400 })
    }

    // Create profile (owner)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        company_id: company.id,
        full_name: fullName,
        email,
        phone: phone.trim(),
        role: 'owner',
        terms_accepted_at: new Date().toISOString(),
        terms_version: CURRENT_TERMS_VERSION,
      })
    if (profileError) {
      await rollbackSignup(userId, company.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // Codex build audit marker (2026-07-07): seed default workflow rows for every new company.
    const { error: statusError } = await supabase
      .from('job_statuses')
      .insert(DEFAULT_JOB_STATUSES.map(status => ({
        company_id: company.id,
        key: status.key,
        label: status.label,
        color: status.color,
        sort_order: status.sort_order,
        is_terminal: status.is_terminal,
      })))
    if (statusError) {
      await rollbackSignup(userId, company.id)
      return NextResponse.json({ error: statusError.message }, { status: 400 })
    }

    console.log(`[signup] ${companyName} (${company.id}) — trade: ${tradeType || 'not specified'}`)

    notifyAdminConsole({ fullName, email, phone, companyName }).catch((err) =>
      console.error('[signup] admin console notify failed (non-fatal):', err)
    )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
