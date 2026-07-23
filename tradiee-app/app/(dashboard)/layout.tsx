import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAccess, type BillingCompany } from '@/lib/billing'
import { getConversations } from '@/lib/messages'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { PowerSyncProvider } from '@/components/providers/powersync-provider'
import { TimezoneProvider } from '@/components/providers/timezone-provider'
import { CountryProvider } from '@/components/providers/country-provider'
import { SubscriptionProvider } from '@/components/providers/subscription-provider'
import { SyncStatusBar } from '@/components/ui/sync-status-bar'
import { WelcomeTutorial } from '@/components/ui/welcome-tutorial'
import { HelpPanel } from '@/components/help/help-panel'
import { TermsGate } from '@/components/legal/terms-gate'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Paywall: trial expired + no active subscription → upgrade (super admins and
  // billing-exempt review accounts bypass this).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin, welcome_tutorial_seen_at, timezone, terms_version, companies!company_id(subscription_status, subscription_plan, trial_ends_at, billing_exempt, theme_accent, test_mode, country)')
    .eq('id', user.id)
    .single()
  const company = (profile?.companies ?? null) as (BillingCompany & { theme_accent?: string | null; test_mode?: boolean | null; country?: string | null }) | null
  if (!hasAccess(!!profile?.is_super_admin, company)) redirect('/upgrade')

  // Must accept the current Terms before using the app (super admins exempt so
  // we can't lock ourselves out). Blocking overlay until accepted.
  const needsTerms = !profile?.is_super_admin && profile?.terms_version !== CURRENT_TERMS_VERSION
  const brandAccent = company?.theme_accent ?? null
  const testMode = company?.test_mode ?? false

  // Field staff get a focused nav (their jobs/schedule/time) — no financials.
  const isStaff = profile?.role === 'staff'

  // Messages nav badge (owner/admin only — staff don't get the Messages tab).
  const unreadMessages = isStaff ? 0 : (await getConversations(supabase)).filter(c => c.unread).length

  const subscriptionInfo = {
    plan: company?.subscription_plan ?? null,
    status: company?.subscription_status ?? null,
    trialEndsAt: company?.trial_ends_at ?? null,
    billingExempt: company?.billing_exempt ?? false,
  }

  return (
    <TimezoneProvider timezone={profile?.timezone}>
     <CountryProvider country={company?.country}>
     <SubscriptionProvider info={subscriptionInfo}>
      <PowerSyncProvider>
        <SidebarProvider>
          <div className="flex h-full">
            <Sidebar isStaff={isStaff} unreadMessages={unreadMessages} />
            <DashboardShell brandAccent={brandAccent} testMode={testMode}>
              <SyncStatusBar />
              {children}
              <WelcomeTutorial initiallyOpen={!profile?.welcome_tutorial_seen_at} />
              <HelpPanel />
              {needsTerms && <TermsGate />}
            </DashboardShell>
          </div>
          <MobileNav isStaff={isStaff} unreadMessages={unreadMessages} />
        </SidebarProvider>
      </PowerSyncProvider>
     </SubscriptionProvider>
     </CountryProvider>
    </TimezoneProvider>
  )
}
