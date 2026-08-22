import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { SettingsClient } from './client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(*)').eq('id', user!.id).single()
  const { data: team } = await supabase.from('profiles').select('*').eq('company_id', profile!.company_id).order('full_name')
  // Service client: companies RLS only permits reading your own row, which
  // would silently null out the referred company's name in this join. Safe
  // here — the .eq('company_id', ...) below already scopes results to only
  // this company's own earned credits; the service client just lets the
  // *display name* of a company they referred come through too.
  const { data: credits } = await createServiceClient()
    .from('referral_credits')
    .select('referred_company_id, month_number, companies!referred_company_id(name)')
    .eq('company_id', profile!.company_id)
    .order('month_number')
  const { data: reminderSettings } = await supabase
    .from('company_reminder_settings')
    .select('*')
    .eq('company_id', profile!.company_id)
    .maybeSingle()

  const company = (profile as unknown as { companies: import('@/lib/types').Company })?.companies
  const typedProfile = profile as unknown as import('@/lib/types').Profile & { companies: import('@/lib/types').Company }
  const googleConnected = !!typedProfile?.google_refresh_token

  // One row per friend, with how many of their first 3 payments have paid out.
  const referredFriends = new Map<string, { companyName: string; monthsEarned: number }>()
  for (const c of (credits ?? []) as unknown as { referred_company_id: string; companies: { name: string } | null }[]) {
    const existing = referredFriends.get(c.referred_company_id)
    if (existing) existing.monthsEarned += 1
    else referredFriends.set(c.referred_company_id, { companyName: c.companies?.name ?? 'A referred company', monthsEarned: 1 })
  }

  return (
    <>
      <Header title="Settings" profile={profile} />
      <SettingsClient
        profile={typedProfile}
        company={company}
        team={team ?? []}
        googleConnected={googleConnected}
        referredFriends={[...referredFriends.values()]}
        reminderSettings={reminderSettings ?? null}
      />
    </>
  )
}
