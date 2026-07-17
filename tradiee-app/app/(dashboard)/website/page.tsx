import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { WebsiteClient } from './client'
import { DEFAULT_THEME, defaultSections, slugify, type WebsiteSection, type WebsiteTheme } from '@/lib/website'
import { hasAddon } from '@/lib/billing'

export default async function WebsitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_super_admin, companies!company_id(id, name, trade_type, address, logo_url, billing_exempt, subscription_status, addons)')
    .eq('id', user!.id)
    .single()

  const company = (profile as unknown as {
    companies: { id: string; name: string; trade_type: string | null; address: string | null; logo_url: string | null; billing_exempt: boolean | null; subscription_status: string | null; addons: Record<string, { active?: boolean }> | null }
  }).companies
  const isSuperAdmin = (profile as unknown as { is_super_admin: boolean | null }).is_super_admin ?? false

  const { data: site } = await supabase
    .from('company_websites')
    .select('*')
    .eq('company_id', company.id)
    .maybeSingle()

  // Recent job photos for the gallery picker (public R2 bucket → build URLs).
  // Owners can exclude specific photos from this pool (excluded_photo_urls) —
  // it doesn't delete the underlying job photo, just hides it from the picker.
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  const { data: photoRows } = await supabase
    .from('job_photos')
    .select('storage_path')
    .or('caption.is.null,caption.neq.Customer sign-off')
    .order('taken_at', { ascending: false })
    .limit(60)
  const excludedPhotoUrls = (site as { excluded_photo_urls?: string[] } | null)?.excluded_photo_urls ?? []
  const photoUrls = (photoRows ?? [])
    .map(p => `${base}/${p.storage_path}`)
    .filter(url => !excludedPhotoUrls.includes(url))

  const existing = site as null | {
    slug: string; is_published: boolean; theme: WebsiteTheme; sections: WebsiteSection[]
    seo_title: string | null; seo_description: string | null
    custom_domain: string | null; domain_status: string
    bookings_enabled: boolean; site_mode: 'builder' | 'custom'; custom_site_status: string
  }

  // Publishing (and bookings, and custom hosting) all gate on the single
  // Bookings Website add-on — or comped/super-admin accounts.
  const canPublish = hasAddon(isSuperAdmin, company, 'bookings_website')

  return (
    <>
      <Header title="Website" profile={profile} />
      <WebsiteClient
        companyId={company.id}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
        canPublish={canPublish}
        photoUrls={photoUrls}
        logoUrl={company.logo_url}
        initial={{
          slug: existing?.slug ?? slugify(company.name),
          isPublished: existing?.is_published ?? false,
          theme: existing?.theme ?? DEFAULT_THEME,
          sections: existing?.sections ?? defaultSections(company),
          seoTitle: existing?.seo_title ?? company.name,
          seoDescription: existing?.seo_description ?? '',
          customDomain: existing?.custom_domain ?? '',
          domainStatus: existing?.domain_status ?? 'none',
          bookingsEnabled: existing?.bookings_enabled ?? false,
          siteMode: existing?.site_mode ?? 'builder',
          customSiteStatus: existing?.custom_site_status ?? 'none',
          exists: !!existing,
        }}
      />
    </>
  )
}
