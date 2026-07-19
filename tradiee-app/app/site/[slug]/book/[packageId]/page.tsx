import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { hasAddon } from '@/lib/billing'
import { BookingWidget } from './booking-widget'
import { EmbedAutoResize } from './embed-resize'

export default async function BookPackagePage({ params, searchParams }: {
  params: Promise<{ slug: string; packageId: string }>
  searchParams: Promise<{ embed?: string }>
}) {
  const { slug, packageId } = await params
  const { embed } = await searchParams
  const isEmbed = embed === '1'
  const service = createServiceClient()

  const { data: site } = await service
    .from('company_websites')
    .select('company_id, is_published, bookings_enabled, companies(name, addons, billing_exempt, phone, logo_url)')
    .eq('slug', slug)
    .single()

  if (!site || !site.is_published || !site.bookings_enabled) notFound()

  const company = site.companies as unknown as { name: string; addons: Record<string, { active?: boolean }> | null; billing_exempt: boolean | null; phone: string | null; logo_url: string | null } | null
  if (!hasAddon(false, company, 'bookings_website')) notFound()

  const { data: pkg } = await service
    .from('bookable_packages')
    .select('id, name, description, duration_minutes, price, deposit_amount, deposit_percent, requires_deposit, is_active')
    .eq('id', packageId).eq('company_id', site.company_id).single()

  if (!pkg || !pkg.is_active) notFound()

  return (
    // Embedded: drop min-h-screen + gray page bg so the iframe hugs the content
    // (min-h-screen would peg the body to the iframe's height and defeat auto-resize).
    <div id="if-booking-root" className={isEmbed ? 'bg-white p-2' : 'min-h-screen bg-gray-50 py-10 px-4'}>
      <div className="max-w-md mx-auto">
        <div className="mb-6 text-center">
          {company?.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={company.logo_url} alt={company.name} className="h-10 mx-auto mb-3" />
            : <p className="font-bold text-lg text-gray-900 mb-1">{company?.name}</p>}
        </div>
        <BookingWidget
          companyId={site.company_id}
          pkg={pkg}
          companyPhone={company?.phone ?? null}
        />
      </div>
      {isEmbed && <EmbedAutoResize />}
    </div>
  )
}
