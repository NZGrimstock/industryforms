// Public sitemap for an Instant Website. Reachable at the site's root domain
// (e.g. https://acme-plumbing.industryforms.app/sitemap.xml) via the proxy
// path-preserving rewrite.

import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = createServiceClient()
  const { data: site } = await service
    .from('company_websites')
    .select('updated_at, is_published, custom_domain')
    .eq('slug', slug)
    .maybeSingle()

  if (!site || !site.is_published) {
    return new Response('Not found', { status: 404 })
  }

  const base = site.custom_domain
    ? `https://${site.custom_domain}`
    : `https://${slug}.${(process.env.NEXT_PUBLIC_APP_URL ?? 'industryforms.app').replace(/^https?:\/\//, '').replace(/^app\./, '')}`

  const lastmod = new Date(site.updated_at ?? Date.now()).toISOString()
  const urls = ['/', '/#contact', '/#book'].map(p =>
    `  <url><loc>${base}${p}</loc><lastmod>${lastmod}</lastmod></url>`
  ).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
