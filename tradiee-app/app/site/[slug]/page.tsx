import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_THEME, type WebsiteSection, type WebsiteTheme } from '@/lib/website'
import { SectionBlock } from './sections'
import { ContactForm } from './contact-form'
import { BookingForm } from './booking-form'

type SiteRow = {
  company_id: string
  slug: string
  is_published: boolean
  theme: WebsiteTheme
  sections: WebsiteSection[]
  seo_title: string | null
  seo_description: string | null
  companies: { name: string; logo_url: string | null; email: string | null; phone: string | null } | null
}

async function getSite(slug: string): Promise<SiteRow | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('company_websites')
    .select('company_id, slug, is_published, theme, sections, seo_title, seo_description, companies(name, logo_url, email, phone)')
    .eq('slug', slug)
    .single()
  return (data as unknown as SiteRow) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const site = await getSite(slug)
  if (!site || !site.is_published) return { title: 'Not found' }

  const name = site.companies?.name ?? 'Welcome'
  const title = site.seo_title || name
  // Pull a description: explicit SEO field → first about/hero subheading → null.
  const fallbackDesc = (() => {
    for (const s of site.sections ?? []) {
      if (s.type === 'about' && s.body) return s.body.slice(0, 160)
      if (s.type === 'hero' && s.subheading) return s.subheading.slice(0, 160)
    }
    return undefined
  })()
  const description = site.seo_description || fallbackDesc
  const logo = site.companies?.logo_url ?? undefined

  return {
    title,
    description,
    openGraph: {
      title, description,
      siteName: name,
      images: logo ? [{ url: logo }] : undefined,
      type: 'website',
    },
    twitter: { card: 'summary', title, description, images: logo ? [logo] : undefined },
    icons: logo ? { icon: logo } : undefined,
  }
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const site = await getSite(slug)
  if (!site || !site.is_published) notFound()

  const theme = { ...DEFAULT_THEME, ...(site.theme ?? {}) }
  const company = site.companies
  const fontFamily = theme.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, sans-serif'

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily }}>
      {/* Top bar */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company?.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={company.logo_url} alt={company.name} className="h-8 w-auto" />
              : <span className="font-bold text-lg text-gray-900">{company?.name}</span>}
          </div>
          <div className="text-right text-sm text-gray-500 hidden sm:block">
            {company?.phone && <a href={`tel:${company.phone}`} className="font-medium" style={{ color: theme.primary }}>{company.phone}</a>}
          </div>
        </div>
      </header>

      {(site.sections ?? []).map((section, i) => (
        <SectionBlock
          key={i}
          section={section}
          primary={theme.primary}
          ContactForm={<ContactForm slug={site.slug} primary={theme.primary} />}
          BookingForm={<BookingForm slug={site.slug} primary={theme.primary} ctaLabel={section.type === 'booking' ? section.ctaLabel : undefined} />}
        />
      ))}

      <footer className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} {company?.name}</p>
        {company?.email && <p className="mt-1">{company.email}</p>}
        <p className="mt-3 text-xs text-gray-300">Powered by IndustryForms</p>
      </footer>
    </div>
  )
}
