import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { SettingsClient } from './client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(*)').eq('id', user!.id).single()
  const { data: team } = await supabase.from('profiles').select('*').eq('company_id', profile!.company_id).order('full_name')

  const company = (profile as unknown as { companies: import('@/lib/types').Company })?.companies
  const typedProfile = profile as unknown as import('@/lib/types').Profile & { companies: import('@/lib/types').Company }
  const googleConnected = !!typedProfile?.google_refresh_token

  return (
    <>
      <Header title="Settings" profile={profile} />
      <SettingsClient profile={typedProfile} company={company} team={team ?? []} googleConnected={googleConnected} />
    </>
  )
}
