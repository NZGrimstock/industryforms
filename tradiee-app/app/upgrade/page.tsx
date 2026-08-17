import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BillingCompany } from '@/lib/billing'
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

  // Already on a real paid plan (or exempt)? No need to see the upgrade page —
  // send them into the app. Trial and free-tier companies still see it, since
  // access is no longer all-or-nothing (see effectivePlanKey() in lib/billing.ts).
  if (profile?.is_super_admin || company?.billing_exempt || company?.subscription_status === 'active') redirect('/dashboard')

  const companyName = (profile?.companies as { name?: string } | null)?.name ?? ''
  return <UpgradeClient companyName={companyName} />
}
