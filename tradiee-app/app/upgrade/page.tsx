import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAccess, type BillingCompany } from '@/lib/billing'
import { UpgradeClient } from './client'

export default async function UpgradePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, companies!company_id(name, subscription_status, subscription_plan, trial_ends_at, billing_exempt)')
    .eq('id', user.id)
    .single()
  const company = (profile?.companies ?? null) as BillingCompany | null

  // Still entitled? Don't show the paywall — send them into the app.
  if (hasAccess(!!profile?.is_super_admin, company)) redirect('/dashboard')

  const companyName = (profile?.companies as { name?: string } | null)?.name ?? ''
  return <UpgradeClient companyName={companyName} />
}
