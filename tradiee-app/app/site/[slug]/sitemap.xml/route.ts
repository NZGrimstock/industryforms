// Public sitemap for an Instant Website. Reachable at the site's root domain
// (e.g. https://acme-plumbing.industryforms.app/sitemap.xml) via the proxy
// path-preserving rewrite. Lists the homepage plus each live booking-package
// page (real, indexable transactional URLs) — fragment anchors like #contact
// are intentionally omitted since crawlers collapse them to the homepage.
import { createServiceClient } from '@/lib/supabase/server'
import { hasAddon } from '@/lib/billing'
import { siteBaseUrl } from '@/lib/website-seo'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = createServiceClient()
  const { data: site } = await service
    .from('company_websites')
    .select('company_id, updated_at, is_published, bookings_enabled, custom_domain, companies(addons, billing_exempt)')
    .eq('slug', slug)
    .maybeSingle()

  if (!site || !site.is_published) return new Response('Not found', { status: 404 })

  const base = siteBaseUrl(slug, site.custom_domain)
  const lastmod = new Date(site.updated_at ?? Date.now()).toISOString()

  const paths: string[] = ['/']

  // Booking-package pages are only reachable when bookings are on AND the
  // company has the bookings_website add-on — mirror the /book page's own gate
  // so we never list a URL that 404s.
  const company = site.companies as unknown as { addons: Record<string, { active?: boolean }> | null; billing_exempt: boolean | null } | null
  if (site.bookings_enabled && hasAddon(false, company, 'bookings_website')) {
    const { data: pkgs } = await service
      .from('bookable_packages')
      .select('id')
      .eq('company_id', site.company_id)
      .eq('is_active', true)
    for (const p of pkgs ?? []) paths.push(`/book/${p.id}`)
  }

  const urls = paths.map(p => {
    const priority = p === '/' ? '1.0' : '0.7'
    return `  <url><loc>${base}${p}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
