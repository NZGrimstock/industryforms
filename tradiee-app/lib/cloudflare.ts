// Cloudflare for SaaS — custom hostnames API.
// Lets a tradie point their own domain (e.g. www.joesplumbing.co.nz) at their
// IndustryForms site. Cloudflare issues + renews the SSL cert per hostname and
// proxies traffic to our origin; `proxy.ts` then resolves the Host → tenant.
//
// Requires (set in env when going live — no-ops/throws clearly until then):
//   CLOUDFLARE_API_TOKEN   — token with "SSL and Certificates: Edit" on the zone
//   CLOUDFLARE_ZONE_ID     — the zone id for industryforms.app
//   CLOUDFLARE_SAAS_FALLBACK_HOSTNAME — the CNAME target customers point at
//                                       (the zone's SaaS fallback origin)

const API = 'https://api.cloudflare.com/client/v4'

export function cloudflareConfigured(): boolean {
  return !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ZONE_ID)
}

export function fallbackTarget(): string {
  // What the customer CNAMEs their domain to.
  return process.env.CLOUDFLARE_SAAS_FALLBACK_HOSTNAME
    ?? (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/^https?:\/\//, '').split('/')[0]
    ?? ''
}

type CfHostname = {
  id: string
  hostname: string
  status: string // 'pending' | 'active' | 'blocked' | ...
  ssl?: { status?: string; validation_records?: { txt_name?: string; txt_value?: string }[] }
  ownership_verification?: { type?: string; name?: string; value?: string }
  verification_errors?: string[]
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  if (!cloudflareConfigured()) throw new Error('Cloudflare is not configured (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID missing)')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    const msg = json?.errors?.[0]?.message ?? `Cloudflare API error (${res.status})`
    throw new Error(msg)
  }
  return json.result as T
}

const zonePath = () => `/zones/${process.env.CLOUDFLARE_ZONE_ID}/custom_hostnames`

export async function createCustomHostname(hostname: string): Promise<CfHostname> {
  return cf<CfHostname>(zonePath(), {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
    }),
  })
}

export async function getCustomHostname(id: string): Promise<CfHostname> {
  return cf<CfHostname>(`${zonePath()}/${id}`)
}

export async function deleteCustomHostname(id: string): Promise<void> {
  await cf(`${zonePath()}/${id}`, { method: 'DELETE' })
}

// The DNS records the customer must add at their registrar.
export function dnsInstructions(hostname: string, cf: CfHostname) {
  const records: { type: string; name: string; value: string; note: string }[] = [
    { type: 'CNAME', name: hostname, value: fallbackTarget(), note: 'Points your domain at IndustryForms' },
  ]
  const dcv = cf.ssl?.validation_records?.[0]
  if (dcv?.txt_name && dcv?.txt_value) {
    records.push({ type: 'TXT', name: dcv.txt_name, value: dcv.txt_value, note: 'Proves you own the domain (for SSL)' })
  }
  return records
}

export function isHostnameActive(cf: CfHostname): boolean {
  return cf.status === 'active' && (cf.ssl?.status === 'active' || cf.ssl?.status === undefined)
}
