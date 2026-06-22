// robots.txt for an Instant Website tenant. Points crawlers at the
// site-specific sitemap so each tenant is discoverable independently.

import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = createServiceClient()
  const { data: site } = await service
    .from('company_websites')
    .select('is_published, custom_domain')
    .eq('slug', slug)
    .maybeSingle()

  if (!site || !site.is_published) {
    return new Response('User-agent: *\nDisallow: /', {
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  const base = site.custom_domain
    ? `https://${site.custom_domain}`
    : `https://${slug}.${(process.env.NEXT_PUBLIC_APP_URL ?? 'industryforms.app').replace(/^https?:\/\//, '').replace(/^app\./, '')}`

  const body = `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' } })
}
