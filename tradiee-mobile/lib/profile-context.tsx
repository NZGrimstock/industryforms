import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

type ProfileContextValue = {
  timezone: string
  country: string
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue>({
  timezone: DEFAULT_TIMEZONE,
  country: 'NZ',
  refreshProfile: async () => {},
})

export function ProfileProvider({ session, children }: { session: Session | null | undefined; children: React.ReactNode }) {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [country, setCountry] = useState('NZ')

  const refreshProfile = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('profiles').select('timezone, companies!company_id(country)').eq('id', session.user.id).single()
    setTimezone(data?.timezone || DEFAULT_TIMEZONE)
    const co = data?.companies as { country?: string | null } | null
    setCountry((co?.country || 'NZ').toUpperCase())
  }, [session])

  useEffect(() => {
    if (session) refreshProfile()
    else { setTimezone(DEFAULT_TIMEZONE); setCountry('NZ') }
  }, [session, refreshProfile])

  return (
    <ProfileContext.Provider value={{ timezone, country, refreshProfile }}>
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

export function useProfileRefresh() {
  return useContext(ProfileContext).refreshProfile
}
