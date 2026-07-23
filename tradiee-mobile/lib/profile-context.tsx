import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

type ProfileContextValue = {
  timezone: string
  country: string
  canTakePayments: boolean
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue>({
  timezone: DEFAULT_TIMEZONE,
  country: 'NZ',
  canTakePayments: false,
  refreshProfile: async () => {},
})

export function ProfileProvider({ session, children }: { session: Session | null | undefined; children: React.ReactNode }) {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [country, setCountry] = useState('NZ')
  const [canTakePayments, setCanTakePayments] = useState(false)

  const refreshProfile = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('profiles')
      .select('timezone, is_super_admin, companies!company_id(country, subscription_status, billing_exempt)')
      .eq('id', session.user.id).single()
    setTimezone(data?.timezone || DEFAULT_TIMEZONE)
    const co = data?.companies as { country?: string | null; subscription_status?: string | null; billing_exempt?: boolean | null } | null
    setCountry((co?.country || 'NZ').toUpperCase())
    // Mirrors lib/billing.ts hasPaidPlan on the web: a paid plan (not trial),
    // billing-exempt review account, or super admin. Server enforces this too.
    setCanTakePayments(!!data?.is_super_admin || !!co?.billing_exempt || co?.subscription_status === 'active')
  }, [session])

  useEffect(() => {
    if (session) refreshProfile()
    else { setTimezone(DEFAULT_TIMEZONE); setCountry('NZ'); setCanTakePayments(false) }
  }, [session, refreshProfile])

  return (
    <ProfileContext.Provider value={{ timezone, country, canTakePayments, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useTimezone() {
  return useContext(ProfileContext).timezone
}

export function useCountry() {
  return useContext(ProfileContext).country
}

export function useCanTakePayments() {
  return useContext(ProfileContext).canTakePayments
}

export function useProfileRefresh() {
  return useContext(ProfileContext).refreshProfile
}
