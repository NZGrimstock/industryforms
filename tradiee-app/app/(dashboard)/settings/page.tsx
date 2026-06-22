import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { SettingsClient } from './client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies(*)').eq('id', user!.id).single()
  const { data: team } = await supabase.from('profiles').select('*').eq('company_id', profile!.company_id).order('full_name')

  const company = (profile as unknown as { companies: import('@/lib/types').Company })?.companies
  const typedProfile = profile as unknown as import('@/lib/types').Profile & { companies: import('@/lib/types').Company }
  const googleConnected = !!typedProfile?.google_refresh_token

  // Server-side env-flag check for the Integrations cards (Twilio, Resend,
  // Stripe). The values are never sent to the client — only `configured: true`.
  const integrationStatus = {
    twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
    resend: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    stripe: !!process.env.STRIPE_SECRET_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  }

  return (
    <>
      <Header title="Settings" profile={profile} />
      <SettingsClient profile={typedProfile} company={company} team={team ?? []} googleConnected={googleConnected} integrationStatus={integrationStatus} />
    </>
  )
}
