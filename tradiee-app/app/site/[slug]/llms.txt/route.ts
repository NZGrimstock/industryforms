// llms.txt — an emerging convention (llmstxt.org) that gives AI answer engines
// (ChatGPT, Perplexity, Claude, Google AI Overviews) a clean, plain-text summary
// of the business to cite. Same reverse-proxy path handling as robots/sitemap:
// reachable at the site root, e.g. https://acme-plumbing.industryforms.app/llms.txt
import { createServiceClient } from '@/lib/supabase/server'
import type { WebsiteSection } from '@/lib/website'
import { siteBaseUrl, siteDescription, areaFromAddress, type SeoCompany } from '@/lib/website-seo'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = createServiceClient()
  const { data: site } = await service
    .from('company_websites')
    .select('is_published, custom_domain, sections, seo_description, companies(name, logo_url, email, phone, address, trade_type, country)')
    .eq('slug', slug)
    .maybeSingle()

  if (!site || !site.is_published) return new Response('Not found', { status: 404 })

  const company = (site.companies as unknown as SeoCompany) ?? null
  if (!company) return new Response('Not found', { status: 404 })
  const sections = (site.sections as unknown as WebsiteSection[]) ?? []
  const url = siteBaseUrl(slug, site.custom_domain)
  const desc = siteDescription(company, sections, site.seo_description)
  const area = areaFromAddress(company.address)

  const lines: string[] = [`# ${company.name}`, '']
  if (desc) lines.push(`> ${desc}`, '')

  const facts: string[] = []
  if (company.trade_type?.trim()) facts.push(`- Trade: ${company.trade_type.trim()}`)
  if (area) facts.push(`- Area served: ${area}`)
  if (company.phone) facts.push(`- Phone: ${company.phone}`)
  if (company.email) facts.push(`- Email: ${company.email}`)
  if (company.address) facts.push(`- Address: ${company.address}`)
  facts.push(`- Website: ${url}`)
  lines.push('## Business details', ...facts, '')

  const servicesSection = sections.find(s => s.type === 'services')
  if (servicesSection && servicesSection.type === 'services') {
    const items = servicesSection.items.filter(i => i.title.trim())
    if (items.length) {
      lines.push(`## ${servicesSection.heading || 'Services'}`)
      for (const i of items) lines.push(`- ${i.title}${i.description?.trim() ? `: ${i.description.trim()}` : ''}`)
      lines.push('')
    }
  }

  const about = sections.find(s => s.type === 'about')
  if (about && about.type === 'about' && about.body?.trim()) {
    lines.push(`## ${about.heading || 'About'}`, about.body.trim(), '')
  }

  lines.push(`## Contact`, `To request a quote or book a visit, use the contact form at ${url}#contact${company.phone ? ` or call ${company.phone}` : ''}.`, '')

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  })
}
