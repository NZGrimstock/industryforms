import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { hasAddon } from '@/lib/billing'
import { BookingsClient } from './client'

export default async function BookingsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_super_admin, company_id, companies!company_id(addons, billing_exempt)')
    .eq('id', user!.id)
    .single()

  if (profile?.role === 'staff') redirect('/dashboard')

  const isSuperAdmin = !!profile?.is_super_admin
  const company = profile?.companies as unknown as { addons: Record<string, { active?: boolean }> | null; billing_exempt: boolean | null } | null
  const entitled = hasAddon(isSuperAdmin, company, 'bookings_website')

  const [packagesRes, settingsRes, rulesRes, blackoutsRes, kitsRes, priceItemsRes, bookingsRes, websiteRes] = await Promise.all([
    supabase.from('bookable_packages').select('*').eq('company_id', profile!.company_id).order('sort_order'),
    supabase.from('booking_settings').select('*').eq('company_id', profile!.company_id).maybeSingle(),
    supabase.from('booking_availability_rules').select('*').eq('company_id', profile!.company_id).order('day_of_week'),
    supabase.from('booking_blackouts').select('*').eq('company_id', profile!.company_id).order('starts_at'),
    supabase.from('kits').select('id, name').eq('company_id', profile!.company_id).order('name'),
    supabase.from('price_list_items').select('id, name').eq('company_id', profile!.company_id).eq('is_active', true).order('name'),
    supabase.from('bookings').select('id, status, customer_name, customer_email, customer_phone, site_address, notes, starts_at, ends_at, deposit_required, deposit_paid, deposit_refunded, stripe_payment_intent_id, bookable_packages(name)')
      .eq('company_id', profile!.company_id).neq('status', 'slot_held').order('starts_at', { ascending: false }).limit(100),
    supabase.from('company_websites').select('slug').eq('company_id', profile!.company_id).maybeSingle(),
  ])

  return (
    <>
      <Header title="Bookings" profile={profile} />
      <BookingsClient
        companyId={profile!.company_id}
        entitled={entitled}
        packages={packagesRes.data ?? []}
        settings={settingsRes.data}
        rules={rulesRes.data ?? []}
        blackouts={blackoutsRes.data ?? []}
        kits={kitsRes.data ?? []}
        priceItems={priceItemsRes.data ?? []}
        bookings={(bookingsRes.data ?? []) as never}
        websiteSlug={websiteRes.data?.slug ?? null}
      />
    </>
  )
}
