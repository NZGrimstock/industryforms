import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  cloudflareConfigured, createCustomHostname, getCustomHostname, deleteCustomHostname,
  dnsInstructions, isHostnameActive,
} from '@/lib/cloudflare'

// Resolve the caller's website row + whether they're allowed the add-on features.
async function ctx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const }
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_super_admin, companies(id, billing_exempt)')
    .eq('id', user.id)
    .single()
  const company = profile?.companies as unknown as { id: string; billing_exempt: boolean | null } | null
  if (!company) return { error: 'Profile not found' as const }
  const { data: site } = await service
    .from('company_websites')
    .select('id, custom_domain, cf_hostname_id, domain_status, subscription_active')
    .eq('company_id', company.id)
    .maybeSingle()
  const entitled = !!site?.subscription_active || !!profile?.is_super_admin || !!company.billing_exempt
  return { service, companyId: company.id, site, entitled }
}

// Connect a custom domain
export async function POST(req: NextRequest) {
  const c = await ctx()
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 401 })
  if (!c.site) return NextResponse.json({ error: 'Save your website first' }, { status: 400 })
  if (!c.entitled) return NextResponse.json({ error: 'The Website add-on is required to connect a custom domain' }, { status: 402 })
  if (!cloudflareConfigured()) return NextResponse.json({ error: 'Custom domains are not enabled yet (Cloudflare not configured)' }, { status: 503 })

  let { domain } = await req.json()
  domain = String(domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: 'Enter a valid domain, e.g. www.yourbusiness.co.nz' }, { status: 400 })
  }

  try {
    // Clean up any previous hostname before re-connecting.
    if (c.site.cf_hostname_id) await deleteCustomHostname(c.site.cf_hostname_id).catch(() => {})
    const cf = await createCustomHostname(domain)
    await c.service.from('company_websites').update({
      custom_domain: domain, cf_hostname_id: cf.id, domain_status: 'pending',
    }).eq('id', c.site.id)
    return NextResponse.json({ domain, status: 'pending', dns: dnsInstructions(domain, cf) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not connect domain' }, { status: 502 })
  }
}

// Re-check verification status
export async function PUT() {
  const c = await ctx()
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 401 })
  if (!c.site?.cf_hostname_id) return NextResponse.json({ error: 'No custom domain to verify' }, { status: 400 })

  try {
    const cf = await getCustomHostname(c.site.cf_hostname_id)
    const active = isHostnameActive(cf)
    const status = active ? 'active' : 'pending'
    await c.service.from('company_websites').update({ domain_status: status }).eq('id', c.site.id)
    return NextResponse.json({
      status,
      sslStatus: cf.ssl?.status ?? null,
      errors: cf.verification_errors ?? [],
      dns: c.site.custom_domain ? dnsInstructions(c.site.custom_domain, cf) : [],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not check status' }, { status: 502 })
  }
}

// Disconnect a custom domain
export async function DELETE() {
  const c = await ctx()
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 401 })
  if (!c.site) return NextResponse.json({ error: 'No website' }, { status: 400 })

  if (c.site.cf_hostname_id) await deleteCustomHostname(c.site.cf_hostname_id).catch(() => {})
  await c.service.from('company_websites').update({
    custom_domain: null, cf_hostname_id: null, domain_status: 'none',
  }).eq('id', c.site.id)
  return NextResponse.json({ status: 'none' })
}
