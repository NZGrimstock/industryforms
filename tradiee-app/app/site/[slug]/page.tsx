import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DEFAULT_THEME, type WebsiteSection, type WebsiteTheme } from '@/lib/website'
import { SiteHeader, SiteFooter, SectionBlock, getStyleModule } from './sections'
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
  bookings_enabled: boolean
  site_mode: 'builder' | 'custom'
  custom_site_key: string | null
  custom_site_status: string
  companies: { name: string; logo_url: string | null; email: string | null; phone: string | null } | null
}

async function getSite(slug: string): Promise<SiteRow | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('company_websites')
    .select('company_id, slug, is_published, theme, sections, seo_title, seo_description, bookings_enabled, site_mode, custom_site_key, custom_site_status, companies(name, logo_url, email, phone)')
    .eq('slug', slug)
    .single()
  return (data as unknown as SiteRow) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const site = await getSite(slug)
  if (!site) return { title: 'Not found' }
  // Real visibility gate (published, or owner previewing a draft) lives in the
  // page component's notFound() below — this just picks the tab title.

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
  if (!site) notFound()

  // Unpublished sites are hidden from the public, but the "Preview" button in
  // the website builder links straight here — let the site's own owner/staff
  // through so drafts are previewable before they publish.
  const isDraft = !site.is_published
  if (isDraft) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = user
      ? await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      : { data: null }
    if (profile?.company_id !== site.company_id) notFound()
  }

  // Direct /site/<slug> access (the in-app Preview link) bypasses proxy.ts's
  // reverse-proxy for custom-hosted sites — redirect to the CDN copy instead.
  if (site.site_mode === 'custom') {
    if (site.custom_site_status === 'disabled') notFound()
    if (site.custom_site_key) {
      const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
      redirect(`${base}/${site.custom_site_key}`)
    }
  }

  const theme = { ...DEFAULT_THEME, ...(site.theme ?? {}) }
  const company = site.companies ?? { name: 'Welcome', logo_url: null, email: null, phone: null }
  const sections = (site.sections ?? []).filter(s => s.type !== 'booking' || site.bookings_enabled)
  const styleMod = getStyleModule(theme.style)

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: styleMod.fontFamily }}>
      {isDraft && (
        <div className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
          Draft preview — not published yet, only visible to you
        </div>
      )}

      <SiteHeader style={theme.style} company={company} primary={theme.primary} />

      {sections.map((section, i) => (
        <SectionBlock
          key={i}
          style={theme.style}
          section={section}
          primary={theme.primary}
          ContactForm={<ContactForm slug={site.slug} primary={theme.primary} variant={styleMod.formVariant} buttonCls={styleMod.formButtonCls} />}
          BookingForm={<BookingForm slug={site.slug} primary={theme.primary} ctaLabel={section.type === 'booking' ? section.ctaLabel : undefined} variant={styleMod.formVariant} buttonCls={styleMod.formButtonCls} />}
        />
      ))}

      <SiteFooter style={theme.style} company={company} />
    </div>
  )
}
