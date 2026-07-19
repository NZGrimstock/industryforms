'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut, User } from 'lucide-react'
import { GlobalSearch } from './global-search'
import { NewMenu } from './new-menu'
import { useSubscription } from '@/components/providers/subscription-provider'

interface HeaderProps {
  title: string
  profile?: { full_name: string; role: string } | null
}

export function Header({ title, profile }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const isStaff = profile?.role === 'staff'
  const subscription = useSubscription()

  const trialDaysLeft = subscription.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null
  const onTrial = !subscription.billingExempt && subscription.status !== 'active' && trialDaysLeft !== null && trialDaysLeft > 0

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between gap-3 px-4 sm:px-6 sticky top-0 z-30">
      <h1 className="text-base font-semibold text-gray-900 shrink-0 hidden sm:block">{title}</h1>
      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        {onTrial && (
          <p className="hidden md:block text-sm font-semibold text-purple-600 whitespace-nowrap">
            FREE TRIAL &mdash; {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left.{' '}
            <Link href="/settings?tab=subscription" className="underline hover:text-purple-800">Subscribe now</Link>
          </p>
        )}
        <GlobalSearch />
        <NewMenu isStaff={isStaff} />
        {profile && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
              <User className="h-4 w-4 text-[var(--accent,#f97316)]" />
            </div>
            <span className="hidden sm:block">{profile.full_name}</span>
            <span className="hidden sm:block text-xs text-gray-400 capitalize">({profile.role})</span>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
