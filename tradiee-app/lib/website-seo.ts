// SEO / GEO / AEO / AIO helpers for the public Instant Website. Server-only
// (no client deps) — used by page.tsx metadata + JSON-LD and the llms.txt route.
import type { WebsiteSection } from './website'

export type SeoCompany = {
  name: string
  logo_url: string | null
  email: string | null
  phone: string | null
  address: string | null
  trade_type: string | null
  country: string | null
}

// Canonical public origin for a site — custom domain if set, else the free
// per-tenant subdomain. Matches the sitemap/robots routes exactly.
export function siteBaseUrl(slug: string, customDomain: string | null): string {
  if (customDomain) return `https://${customDomain}`
  const appHost = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://industryforms.app')
    .replace(/^https?:\/\//, '')
    .replace(/^app\./, '')
  return `https://${slug}.${appHost}`
}

// Map a freeform trade to the closest schema.org LocalBusiness subtype, so
// answer engines classify the business correctly. Falls back to LocalBusiness.
export function schemaTypeForTrade(trade: string | null | undefined): string {
  const t = (trade ?? '').toLowerCase()
  if (/electric/.test(t)) return 'Electrician'
  if (/plumb/.test(t)) return 'Plumber'
  if (/roof/.test(t)) return 'RoofingContractor'
  if (/hvac|heat|air.?con|ventilat|refriger/.test(t)) return 'HVACBusiness'
  if (/paint/.test(t)) return 'HousePainter'
  if (/locksmith/.test(t)) return 'Locksmith'
  if (/build|construct|carpent|renovat|builder|fit.?out|joiner/.test(t)) return 'GeneralContractor'
  if (/landscap|garden|lawn|arborist|tree|fenc/.test(t)) return 'HomeAndConstructionBusiness'
  return 'LocalBusiness'
}

// Best-guess "area served" from a freeform address — drops the street number
// and any trailing postcode / country, keeps the suburb + city/region.
export function areaFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const parts = address.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length <= 1) return parts[0] ?? null
  const mid = parts.slice(1).filter(p => !/^\d{3,}$/.test(p) && !/new zealand|australia|^nz$|^aus$/i.test(p))
  return ((mid.length ? mid : parts.slice(1)).slice(0, 2).join(', ')) || null
}

// The site's description: explicit SEO field → first about body / hero
// subheading → a sensible generated line. Shared by <meta> and JSON-LD.
export function siteDescription(company: SeoCompany, sections: WebsiteSection[], seoDescription?: string | null): string | undefined {
  if (seoDescription?.trim()) return seoDescription.trim()
  for (const s of sections) {
    if (s.type === 'about' && s.body?.trim()) return s.body.trim().slice(0, 300)
    if (s.type === 'hero' && s.subheading?.trim()) return s.subheading.trim().slice(0, 300)
  }
  const trade = company.trade_type?.trim()
  const area = areaFromAddress(company.address)
  return trade ? `${company.name} — ${trade}${area ? ` serving ${area}` : ''}.` : undefined
}

// Serialize a JSON-LD graph for embedding in a <script type="application/ld+json">
// block. JSON.stringify alone is NOT safe here: it does not escape `<`, so any
// tenant-controlled string containing `</script>` closes the tag early and turns
// the rest into live markup. Every field in the graph below is tenant-editable
// (company name, service titles, FAQ answers, SEO description), and the public
// site also renders at app.industryforms.app/site/<slug> — the same origin that
// holds the app's session cookies — so a breakout here is XSS on the real app
// origin, not just on the tenant's own subdomain.
//
// Escaping as \uXXXX keeps the output valid JSON (parsers decode it back to the
// original characters) while making a tag breakout impossible. U+2028/U+2029 are
// included because they're legal in JSON strings but are line terminators in
// JavaScript, which breaks the script block in older parsers.
export function serializeJsonLd(graph: unknown): string {
  return JSON.stringify(graph)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// schema.org JSON-LD graph: LocalBusiness (typed by trade) + WebSite + a
// Service node per listed service + FAQPage. This is the core GEO/AEO/AIO
// payload. (Google restricted *FAQ rich results* to gov/health sites in 2023,
// but the markup is still what AI answer engines parse to lift a Q&A — which
// is the point of the FAQ section, not the SERP accordion.)
export function buildJsonLd(opts: {
  company: SeoCompany
  url: string
  sections: WebsiteSection[]
  description?: string
}) {
  const { company, url, sections, description } = opts
  const bizId = `${url}#business`
  const area = areaFromAddress(company.address)

  const business: Record<string, unknown> = {
    '@type': schemaTypeForTrade(company.trade_type),
    '@id': bizId,
    name: company.name,
    url,
    ...(company.logo_url ? { image: company.logo_url, logo: company.logo_url } : {}),
    ...(company.phone ? { telephone: company.phone } : {}),
    ...(company.email ? { email: company.email } : {}),
    ...(description ? { description } : {}),
    ...(company.address
      ? { address: { '@type': 'PostalAddress', streetAddress: company.address, ...(company.country ? { addressCountry: company.country } : {}) } }
      : {}),
    ...(area ? { areaServed: { '@type': 'Place', name: area } } : {}),
  }

  const website = { '@type': 'WebSite', name: company.name, url }

  const servicesSection = sections.find(s => s.type === 'services')
  const services = servicesSection && servicesSection.type === 'services'
    ? servicesSection.items
        .filter(i => i.title.trim())
        .map(i => ({
          '@type': 'Service',
          name: i.title,
          ...(i.description?.trim() ? { description: i.description } : {}),
          provider: { '@id': bizId },
        }))
    : []

  const faqSection = sections.find(s => s.type === 'faq')
  const faqs = faqSection && faqSection.type === 'faq'
    ? faqSection.items.filter(f => f.question.trim() && f.answer.trim())
    : []
  const faqPage = faqs.length
    ? [{
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.question.trim(),
          acceptedAnswer: { '@type': 'Answer', text: f.answer.trim() },
        })),
      }]
    : []

  return { '@context': 'https://schema.org', '@graph': [business, website, ...services, ...faqPage] }
}
