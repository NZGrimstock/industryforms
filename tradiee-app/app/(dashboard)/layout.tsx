import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAccess, type BillingCompany } from '@/lib/billing'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { PowerSyncProvider } from '@/components/providers/powersync-provider'
import { SyncStatusBar } from '@/components/ui/sync-status-bar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Paywall: trial expired + no active subscription → upgrade (super admins and
  // billing-exempt review accounts bypass this).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin, companies(subscription_status, subscription_plan, trial_ends_at, billing_exempt, theme_accent)')
    .eq('id', user.id)
    .single()
  const company = (profile?.companies ?? null) as (BillingCompany & { theme_accent?: string | null }) | null
  if (!hasAccess(!!profile?.is_super_admin, company)) redirect('/upgrade')
  const brandAccent = company?.theme_accent ?? null

  // Field staff get a focused nav (their jobs/schedule/time) — no financials.
  const isStaff = profile?.role === 'staff'

  return (
    <PowerSyncProvider>
      <SidebarProvider>
        <div className="flex h-full">
          <Sidebar isStaff={isStaff} />
          <DashboardShell brandAccent={brandAccent}>
            <SyncStatusBar />
            {children}
          </DashboardShell>
        </div>
        <MobileNav isStaff={isStaff} />
      </SidebarProvider>
    </PowerSyncProvider>
  )
}
